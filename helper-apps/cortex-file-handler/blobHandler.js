import fs from "fs";
import path from "path";
import { BlobServiceClient } from "@azure/storage-blob";
import { v4 as uuidv4 } from "uuid";
import Busboy from "busboy";
import { PassThrough } from "stream";
import { pipeline as _pipeline } from "stream";
import { promisify } from "util";
const pipeline = promisify(_pipeline);
import { join } from "path";
import { Storage } from "@google-cloud/storage";
import axios from "axios";
import { publicFolder, port, ipAddress } from "./start.js";
import mime from "mime-types";

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".tiff",
  ".svg",
  ".pdf"
];

const VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".ogg",
  ".mov",
  ".avi",
  ".flv",
  ".wmv",
  ".mkv",
];

function isBase64(str) {
  try {
    return btoa(atob(str)) == str;
  } catch (err) {
    return false;
  }
}

const GCP_SERVICE_ACCOUNT_KEY =
  process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64 ||
  process.env.GCP_SERVICE_ACCOUNT_KEY ||
  "{}";
const GCP_SERVICE_ACCOUNT = isBase64(GCP_SERVICE_ACCOUNT_KEY)
  ? JSON.parse(Buffer.from(GCP_SERVICE_ACCOUNT_KEY, "base64").toString())
  : JSON.parse(GCP_SERVICE_ACCOUNT_KEY);
const { project_id: GCP_PROJECT_ID } = GCP_SERVICE_ACCOUNT;

let gcs;
if (!GCP_PROJECT_ID || !GCP_SERVICE_ACCOUNT) {
  console.warn(
    "Google Cloud Project ID or Service Account details are missing"
  );
} else {
  try {
    gcs = new Storage({
      projectId: GCP_PROJECT_ID,
      credentials: GCP_SERVICE_ACCOUNT,
    });

    // Rest of your Google Cloud operations using gcs object
  } catch (error) {
    console.error(
      "Provided Google Cloud Service Account details are invalid: ",
      error
    );
  }
}

const GCS_BUCKETNAME = process.env.GCS_BUCKETNAME || "cortextempfiles";

const getBlobClient = async () => {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
  if (!connectionString || !containerName) {
    throw new Error(
      "Missing Azure Storage connection string or container name environment variable"
    );
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

  const serviceProperties = await blobServiceClient.getProperties();
  if(!serviceProperties.defaultServiceVersion) {
    serviceProperties.defaultServiceVersion = '2020-02-10';
    await blobServiceClient.setProperties(serviceProperties);
  }

  const containerClient = blobServiceClient.getContainerClient(containerName);

  return { blobServiceClient, containerClient };
};

async function saveFileToBlob(chunkPath, requestId) {
  const { containerClient } = await getBlobClient();
  // Use the filename with a UUID as the blob name
  const blobName = `${requestId}/${uuidv4()}_${encodeURIComponent(path.basename(chunkPath))}`;

  // Create a read stream for the chunk file
  const fileStream = fs.createReadStream(chunkPath);

  // Upload the chunk to Azure Blob Storage using the stream
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadStream(fileStream);

  // Return the full URI of the uploaded blob
  const blobUrl = blockBlobClient.url;
  return blobUrl;
}

//deletes blob that has the requestId
async function deleteBlob(requestId) {
  if (!requestId) throw new Error("Missing requestId parameter");
  const { containerClient } = await getBlobClient();
  // List the blobs in the container with the specified prefix
  const blobs = containerClient.listBlobsFlat({ prefix: `${requestId}/` });

  const result = [];
  // Iterate through the blobs
  for await (const blob of blobs) {
    // Delete the matching blob
    const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
    await blockBlobClient.delete();
    console.log(`Cleaned blob: ${blob.name}`);
    result.push(blob.name);
  }

  return result;
}

async function uploadBlob(
  context,
  req,
  saveToLocal = false,
  useGoogle = false
) {
  return new Promise((resolve, reject) => {
    try {
      const busboy = Busboy({ headers: req.headers });
      let requestId = uuidv4();
      let body = {};

      busboy.on("field", (fieldname, value) => {
        if (fieldname === "requestId") {
          requestId = value;
        } else if (fieldname === "useGoogle") {
          useGoogle = value;
        }
      });

      busboy.on("file", async (fieldname, file, info) => {
        //do not use google if file is not image or video
        const ext = path.extname(info.filename).toLowerCase();
        const canUseGoogle = IMAGE_EXTENSIONS.includes(ext) || VIDEO_EXTENSIONS.includes(ext);
        if(!canUseGoogle) {
          useGoogle = false;
        }

        //check if useGoogle is set but no gcs and warn
        if(useGoogle && useGoogle !== "false" && !gcs) {
          context.log.warn("Google Cloud Storage is not initialized reverting google upload ");
          useGoogle = false;
        }

        if (saveToLocal) {
          // Create the target folder if it doesn't exist
          const localPath = join(publicFolder, requestId);
          fs.mkdirSync(localPath, { recursive: true });

          const filename = encodeURIComponent(`${uuidv4()}_${info.filename}`);
          const destinationPath = `${localPath}/${filename}`;

          await pipeline(file, fs.createWriteStream(destinationPath));

          const message = `File '${filename}' saved to folder successfully.`;
          context.log(message);

          const url = `http://${ipAddress}:${port}/files/${requestId}/${filename}`;

          body = { message, url };

          resolve(body); // Resolve the promise
        } else {
          const filename = encodeURIComponent(`${requestId}/${uuidv4()}_${info.filename}`);
          const { containerClient } = await getBlobClient();

          const contentType = mime.lookup(filename);  // content type based on file extension
          const options = {};
          if (contentType) {
            options.blobHTTPHeaders = { blobContentType: contentType };
          }

          const blockBlobClient = containerClient.getBlockBlobClient(filename);

          const passThroughStream = new PassThrough();
          file.pipe(passThroughStream);

          await blockBlobClient.uploadStream(passThroughStream, undefined, undefined, options);

          const message = `File '${filename}' uploaded successfully.`;
          const url = blockBlobClient.url;
          context.log(message);
          body = { message, url };
        }

        context.res = {
          status: 200,
          body,
        };

        if (useGoogle && useGoogle !== "false") {
          const { url } = body;
          const filename = encodeURIComponent(`${requestId}/${uuidv4()}_${info.filename}`);
          const gcsFile = gcs.bucket(GCS_BUCKETNAME).file(filename);
          const writeStream = gcsFile.createWriteStream();

          const response = await axios({
            method: "get",
            url: url,
            responseType: "stream",
          });

          // Pipe the Axios response stream directly into the GCS Write Stream
          response.data.pipe(writeStream);

          await new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
          });

          body.gcs = `gs://${GCS_BUCKETNAME}/${filename}`;
        }

        resolve(body); // Resolve the promise
      });

      busboy.on("error", (error) => {
        context.log.error("Error processing file upload:", error);
        context.res = {
          status: 500,
          body: "Error processing file upload.",
        };
        reject(error); // Reject the promise
      });

      req.pipe(busboy);
    } catch (error) {
      context.log.error("Error processing file upload:", error);
      context.res = {
        status: 500,
        body: "Error processing file upload.",
      };
      reject(error); // Reject the promise
    }
  });
}

// Function to delete files that haven't been used in more than a month
async function cleanup(urls=null) {
  const { containerClient } = await getBlobClient();

  if(!urls) {
    const xMonthAgo = new Date();
    xMonthAgo.setMonth(xMonthAgo.getMonth() - 1);

    const blobs = containerClient.listBlobsFlat();
    const cleanedURLs = [];
    
    for await (const blob of blobs) {
      const lastModified = blob.properties.lastModified;
      if (lastModified < xMonthAgo) {
        const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
        await blockBlobClient.delete();
        console.log(`Cleaned blob: ${blob.name}`);
        cleanedURLs.push(blob.name);
      }
    }
    
    return cleanedURLs;
  }else{
    // Delete the blobs with the specified URLs 
    const cleanedURLs = [];
    for(const url of urls) {
      // Remove the base url to get the blob name
      const blobName = url.replace(containerClient.url, '');
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.delete();
      console.log(`Cleaned blob: ${blobName}`);
      cleanedURLs.push(blobName);
    }
    return cleanedURLs;
  }
}

async function cleanupGCS(urls=null) {
  const bucket = gcs.bucket(GCS_BUCKETNAME);
  const directories = new Set();
  const cleanedURLs = [];

  if(!urls){
    const daysN = 30;
    const thirtyDaysAgo = new Date(Date.now() - daysN * 24 * 60 * 60 * 1000);
    const [files] = await bucket.getFiles();

    for (const file of files) {
      const [metadata] = await file.getMetadata();
      const directoryPath = path.dirname(file.name);
      directories.add(directoryPath);
      if (metadata.updated) {
        const updatedTime = new Date(metadata.updated);
        if (updatedTime.getTime() < thirtyDaysAgo.getTime()) {
          console.log(`Cleaning file: ${file.name}`);
          await file.delete();
          cleanedURLs.push(file.name);
        }
      }
    }
  }else{
    try {
      for(const url of urls) {
        const filename = path.join(url.split('/').slice(3).join('/'));
        const file = bucket.file(filename);
        const directoryPath = path.dirname(file.name);
        directories.add(directoryPath);
        await file.delete();
        cleanedURLs.push(url);
      }
    }catch(error){
      console.error(`Error cleaning up files: ${error}`);
    }
  }

  for (const directory of directories) {
    const [files] = await bucket.getFiles({ prefix: directory });
    if (files.length === 0) {
      console.log(`Deleting empty directory: ${directory}`);
      await bucket.deleteFiles({ prefix: directory });
    }
  }

  return cleanedURLs;
}

export { saveFileToBlob, deleteBlob, uploadBlob, cleanup, cleanupGCS };
