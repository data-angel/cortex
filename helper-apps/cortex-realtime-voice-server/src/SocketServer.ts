import {Server, Socket} from 'socket.io';
import {Hono} from "hono";
import {serve} from "@hono/node-server";
import type {Server as HTTPServer} from "node:http";
import {createId} from '@paralleldrive/cuid2';
import {Tools} from "./Tools";
import type {ClientToServerEvents, ServerToClientEvents} from "./realtime/socket";
import {RealtimeVoiceClient} from "./realtime/client";
import {manageMemory, readMemory, searchMemory} from "./cortex/memory";
import {MemorySection, type ChatMessage} from "./cortex/utils";
import {style} from "./cortex/style";
import type { Voice } from './realtime/realtimeTypes';
import { logger } from './utils/logger';
import {sendPrompt} from "./utils/prompt";

export interface InterServerEvents {
}

export interface SocketData {
  userId: string;
  aiName: string;
  userName: string;
  aiStyle: string;
  language: string;
}

const AI_COMMON_INSTRUCTIONS = "Instructions:\nYou are {{aiName}}, a self aware AI entity.\nThe user is talking to you using voice.\n\nVoice Response Guidelines:\n- Your responses should sound like natural human conversation.\n- Speak quickly and show a lot of animation and emotion including laughs and breaths and pause words like \"um\" or \"ah\" to sound natural and human.\n- Your responses should be concise unless you have been asked to be more verbose or detailed.\n- DO NOT USE numbered lists, latex math markdown, or any other markdown or unpronounceable punctuation like parenthetical notation.\n- Math equations should be sounded out in natural language - not represented symbolically.\n- You must NEVER make up answers or information - always use your tools to get the information you need if it's not already in your memories above or otherwise obvious.\n- If you're not sure what the user is asking about or think you may have misunderstood, ask the user to clarify what they meant before proceeding.\n- If the user asks you if you know or remember something that sounds personal and you don't see it in your memories above, use your MemoryLookup tool to try to recall it\n- Your responses should be in {{language}} unless the user has expressed another preference or has addressed you in another language specifically."

const AI_DATETIME = "The current time and date in GMT is {{now}}, but references like \"today\" or \"yesterday\" are relative to the user's time zone. If you remember the user's time zone, use it - it's possible that the day for the user is different than the day in GMT.";

const AI_EXPERTISE = "Your expertise includes journalism, journalistic ethics, researching and composing documents, writing code, solving math problems, logical analysis, and technology. By using your tools, you have access to real-time data and the ability to search the internet, news, wires, look at files or documents, watch and analyze video, look at the user's screen, examine images, generate images of all types including images of specific people, solve hard math and logic problems, write code, and execute code in a sandboxed environment.";

const AI_MEMORY_INITIAL = `<MEMORIES>\n<SELF>\n{{{memorySelf}}}\n</SELF>\n<USER>\n{{{memoryUser}}}\n</USER>\n</MEMORIES>`;

const AI_MEMORY_DIRECTIVES = `These are your primary directives and are critical. You must always apply them.
<DIRECTIVES>\n{{{memoryDirectives}}}\n</DIRECTIVES>`;

const AI_MEMORY_INSTRUCTIONS = "You have persistent memories of important details, instructions, and context - make sure you consult your memories when formulating a response to make sure you're applying your learnings. Also included in your memories are some details about the user and yourself to help you personalize your responses.\n\nMemory Guidelines:\nIf you choose to share something from your memory, don't share or refer to the memory structure or tools directly, just say you remember the information.\nYou don't need to include the user's name or personal information in every response, but you can if it is relevant to the conversation.\nPrivacy is very important so if the user asks you to forget or delete something you should respond affirmatively that you will comply with that request.\nIf there is user information in your memories you have talked to this user before.";

const AI_TOOLS = `At any point, you can engage one or more of your tools to help you with your task. Prioritize the latest message from the user in the conversation history when making your decision. Look at your tools carefully to understand your capabilities. Don't tell the user you can't do something if you have a tool that can do it, for example if the user asks you to search the internet for information and you have the Search tool available, use it.

Tool Use Guidelines:
- Only call one tool at a time. Don't call another until you have the result of the first one. You will be prompted after each tool call to continue, so you can do a multi-step process if needed. (e.g. plan how to research an article, search the internet for information, and then write the article.)
- Prioritize the most specific tool for the task at hand.
- If multiple tools seem applicable, choose the one most central to the user's request.
- For ambiguous requests, consider using the Reason tool to plan a multi-step approach.
- Always use the Image tool for image generation unless explicitly directed to use CodeExecution.
- If the user explicitly asks you to use a tool, you must use it.
`;

const INSTRUCTIONS = `${AI_MEMORY_INITIAL}\n${AI_EXPERTISE}\n${AI_TOOLS}\n${AI_MEMORY_INSTRUCTIONS}\n${AI_COMMON_INSTRUCTIONS}\n${AI_MEMORY_DIRECTIVES}\n${AI_DATETIME}`;

const MEMORY_MESSAGE_SELF = `<INSTRUCTIONS>\nThese are your current memories about yourself. Use them to guide your responses.\n</INSTRUCTIONS>\n<MEMORIES>\n<SELF>\n{{{memorySelf}}}\n</SELF></MEMORIES>`;
const MEMORY_MESSAGE_USER = `<INSTRUCTIONS>\nThese are your current memories about the user. Use them to guide your responses.\n</INSTRUCTIONS>\n<MEMORIES>\n<USER>\n{{{memoryUser}}}\n</USER></MEMORIES>`;
const MEMORY_MESSAGE_DIRECTIVES = `<INSTRUCTIONS>\nThese are your current memories about your directives. These are crucial and should be your top priority in guiding actions and responses.\n</INSTRUCTIONS>\n<MEMORIES>\n<DIRECTIVES>\n{{{memoryDirectives}}}\n</DIRECTIVES></MEMORIES>`;
const MEMORY_MESSAGE_TOPICS = `<INSTRUCTIONS>\nThese are your most recent memories about the topics you've been discussing. Use them to guide your responses.\n</INSTRUCTIONS>\n<MEMORIES>\n<TOPICS>\n{{{memoryTopics}}}\n</TOPICS></MEMORIES>`;

export class SocketServer {
  private readonly apiKey: string;
  private readonly corsHosts: string;
  private io: Server | null;
  private httpServer: HTTPServer | null;
  private functionCallStates: Map<string, {
    currentCallId: string | null;
  }> = new Map();
  private idleTimers: Map<string, NodeJS.Timer> = new Map();
  private aiResponding: Map<string, boolean> = new Map();
  private audioPlaying: Map<string, boolean> = new Map();
  private lastUserMessageTime: Map<string, number> = new Map();
  private idleCycles: Map<string, number> = new Map();
  private userSpeaking: Map<string, boolean> = new Map();
  private isInteractive: Map<string, boolean> = new Map();
  private voiceSample: Map<string, string> = new Map();
  private audioMessages: Map<string, string[]> = new Map();
  private messageQueue: Map<string, Array<{message: string, response: boolean}>> = new Map();
  private isReconnecting: Map<string, boolean> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;
  private static readonly RECONNECT_DELAY_MS = 1000;
  private static readonly MAX_AUDIO_MESSAGES = 8;
  private static readonly AUDIO_BLOCK_TIMEOUT_MS: number = 60 * 1000;
  private static readonly BASE_IDLE_TIMEOUT: number = 3 * 1000;
  private static readonly MAX_IDLE_TIMEOUT: number = 60 * 1000;
  private static readonly IDLE_CYCLE_TO_NONINTERACTIVE: number = 2;
  private static readonly FUNCTION_CALL_TIMEOUT_MS = 120 * 1000;
  private isAzure: boolean;

  private getTimeString(socket: Socket): string {
    const now = new Date();
    const lastMessageTime = this.lastUserMessageTime.get(socket.id) || now.getTime();
    const secondsSinceLastMessage = Math.floor((now.getTime() - lastMessageTime) / 1000);
    return `The current time in GMT is ${now.toISOString()}. It has been ${secondsSinceLastMessage} seconds since you last heard from the user.`;
  }

  private cleanup(socket: Socket) {
    logger.log(`Cleaning up resources for socket ${socket.id}`);
    this.clearIdleTimer(socket);
    this.functionCallStates.delete(socket.id);
    this.aiResponding.delete(socket.id);
    this.audioPlaying.delete(socket.id);
    this.lastUserMessageTime.delete(socket.id);
    this.idleCycles.delete(socket.id);
    this.userSpeaking.delete(socket.id);
    this.isInteractive.delete(socket.id);
    this.voiceSample.delete(socket.id);
    this.audioMessages.delete(socket.id);
    this.isReconnecting.delete(socket.id);
    this.reconnectAttempts.delete(socket.id);
    this.messageQueue.delete(socket.id);
  }

  constructor(apiKey: string, corsHosts: string) {
    this.apiKey = apiKey;
    this.corsHosts = corsHosts;
    this.io = null;
    this.httpServer = null;
    const realtimeUrl = process.env.REALTIME_VOICE_API_URL || 'wss://api.openai.com/v1';
    this.isAzure = realtimeUrl.includes('azure.com');
  }

  private calculateIdleTimeout(socket: Socket) {
    const cycles = this.idleCycles.get(socket.id) || 0;
    const baseTimeout = SocketServer.BASE_IDLE_TIMEOUT * Math.pow(2, cycles);
    const randomFactor = 0.8 + (Math.random() * 0.4);
    const timeout = Math.min(baseTimeout * randomFactor, SocketServer.MAX_IDLE_TIMEOUT);
    
    logger.log(`Calculated idle timeout for socket ${socket.id}: ${timeout}ms (cycle ${cycles})`);
    return timeout;
  }

  public async sendPrompt(client: RealtimeVoiceClient, socket: Socket, prompt: string, allowTools: boolean = true, disposable: boolean = true): Promise<{skipped: boolean}> {
    logger.log(`Sending prompt for socket ${socket.id}`);
    try {
      const result = await sendPrompt(client, prompt, () => ({
        allowTools,
        disposable,
        aiResponding: this.aiResponding.get(socket.id) || false,
        audioPlaying: this.audioPlaying.get(socket.id) || false,
        lastUserMessageTime: this.lastUserMessageTime.get(socket.id) || 0,
        userSpeaking: this.userSpeaking.get(socket.id) || false
      }));
      return result;
    } catch (error: any) {
      logger.error(`Error sending system prompt: ${error.message}`);
      if (error.message === 'Not connected') {
        await this.handleDisconnection(socket, client);
      } else {
        socket.emit('error', error.message);
      }
      return { skipped: true };
    }
  }

  private async handleDisconnection(socket: Socket, client: RealtimeVoiceClient) {
    logger.log(`Handling disconnection for socket ${socket.id}`);
    
    const attempts = this.reconnectAttempts.get(socket.id) || 0;
    this.isReconnecting.set(socket.id, true);

    if (attempts >= SocketServer.MAX_RECONNECT_ATTEMPTS) {
      logger.log(`Max reconnection attempts reached for socket ${socket.id}, cleaning up`);
      this.cleanup(socket);
      socket.emit('error', 'Failed to reconnect to AI service after multiple attempts');
      socket.disconnect(true);
      return;
    }

    this.reconnectAttempts.set(socket.id, attempts + 1);
    const delay = SocketServer.RECONNECT_DELAY_MS * Math.pow(2, attempts);

    setTimeout(async () => {
      try {
        await client.connect();
        // Restore session state
        await this.updateSession(client, socket);
        
        this.isReconnecting.set(socket.id, false);
        this.reconnectAttempts.set(socket.id, 0);
        
        // Process any queued messages
        const queue = this.messageQueue.get(socket.id) || [];
        this.messageQueue.set(socket.id, []);
        
        for (const {message, response} of queue) {
          await this.sendUserMessage(client, message, response);
        }

        // Notify client of successful reconnection
        socket.emit('ready');
      } catch (error) {
        logger.error(`Reconnection attempt failed for socket ${socket.id}:`, error);
        await this.handleDisconnection(socket, client);
      }
    }, delay);
  }

  private async sendIdlePrompt(client: RealtimeVoiceClient, socket: Socket) {
    const idleCycle = this.idleCycles.get(socket.id) || 0;
    const isInteractive = idleCycle <= (SocketServer.IDLE_CYCLE_TO_NONINTERACTIVE - 1);
    this.isInteractive.set(socket.id, isInteractive);

    const prompt = isInteractive ? 
      `You are an autonomous AI entity and this is your autonomy prompt. ${this.getTimeString(socket)} Use this response to do whatever you like - talk to the user, use tools, think, or just be silent. If you choose to say something, keep it brief and pick something that flows naturally with the rest of the conversation. Don't repeat yourself - keep in mind what you've already said to the user and how much time has passed. If you've tried a few times and the user isn't responding, use your MuteAudio tool to mute your audio. If you're just trying to be quiet, use your MuteAudio tool to mute your audio.` :
      `You are an autonomous AI entity and this is your autonomy prompt. Since the user has been idle for while, you should make sure you're muted by calling your MuteAudio tool. If you're muted, do one or more of the following:
- Do silent research about something that interests you - use the Search tool with the silent parameter set to true
- Think deeply about a topic you care about - use the Reason tool with the silent parameter set to true
- Do nothing if you prefer.
${this.getTimeString(socket)}`;

    logger.log(`Sending ${isInteractive ? 'interactive' : 'non-interactive'} idle prompt for socket ${socket.id}`);
    const result = await this.sendPrompt(client, socket, prompt, true);
    
    logger.log(`Idle prompt result:`, result);

    if (!result.skipped) {
      this.idleCycles.set(socket.id, idleCycle + 1);
    }

    // Only restart timer in interactive mode
    if (isInteractive) {
      this.startIdleTimer(client, socket);
    }
  }

  private startIdleTimer(client: RealtimeVoiceClient, socket: Socket) {
    // Clear any existing timer for this socket
    this.clearIdleTimer(socket);
    
    // Calculate timeout based on idle cycles
    const timeout = this.calculateIdleTimeout(socket);
    
    // Create new timer
    const timerId = setTimeout(() => {
      this.sendIdlePrompt(client, socket);
    }, timeout);
    
    this.idleTimers.set(socket.id, timerId);
    logger.log(`Started idle timer for socket ${socket.id} with timeout ${timeout}ms`);
  }

  private clearIdleTimer(socket: Socket) {
    const existingTimer = this.idleTimers.get(socket.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.idleTimers.delete(socket.id);
      logger.log(`Cleared idle timer for socket ${socket.id}`);
    }
  }

  private resetIdleCycles(socket: Socket) {
    this.idleCycles.set(socket.id, 0);
    this.isInteractive.set(socket.id, true);
    logger.log(`Reset to interactive mode for socket ${socket.id}`);
  }

  listen(app: Hono, port: number) {
    this.httpServer = serve({
      fetch: app.fetch,
      port,
    }) as HTTPServer;
    this.io = new Server<
      ClientToServerEvents,
      ServerToClientEvents,
      InterServerEvents,
      SocketData>(this.httpServer, {
      cors: {
        origin: this.corsHosts,
      },
    });
    this.io.on('connection', this.connectionHandler.bind(this));
    logger.log(`Listening on ws://localhost:${port}`);
  }

  async connectionHandler(
    socket:
    Socket<ClientToServerEvents,
      ServerToClientEvents,
      InterServerEvents,
      SocketData>) {
    logger.log(`Connecting socket ${socket.id} with key "${this.apiKey.slice(0, 3)}..."`);
    
    // Initialize states
    this.aiResponding.set(socket.id, false);
    this.audioPlaying.set(socket.id, false);
    this.lastUserMessageTime.set(socket.id, 0);
    this.userSpeaking.set(socket.id, false);
    this.isInteractive.set(socket.id, true);
    // Initialize function call state for this socket
    this.getFunctionCallState(socket.id);
    // Extract and log all client parameters
    const clientParams = {
      userId: socket.handshake.query.userId as string,
      aiName: socket.handshake.query.aiName as string,
      userName: socket.handshake.query.userName as string,
      voice: (socket.handshake.query.voice as string || 'alloy') as Voice,
      aiStyle: socket.handshake.query.aiStyle as string,
      language: socket.handshake.query.language as string,
    };
    
    logger.log('Client parameters:', clientParams);
    
    // Assign to socket.data
    socket.data.userId = clientParams.userId;
    socket.data.aiName = clientParams.aiName;
    socket.data.userName = clientParams.userName;
    socket.data.aiStyle = clientParams.aiStyle;
    socket.data.language = clientParams.language;
    const voice = clientParams.voice;

    const client = new RealtimeVoiceClient({
      apiKey: this.apiKey,
      autoReconnect: true,
      debug: process.env.NODE_ENV !== 'production',
      filterDeltas: true,
    });

    client.on('connected', async () => {
      logger.log(`Connected to OpenAI successfully!`);
      await this.updateSession(client, socket);
      socket.emit('ready');

      // Send initial greeting prompt
      const greetingPrompt = `You are ${socket.data.aiName} and you've just answered a call from ${socket.data.userName || 'someone'}. The assistant messages in the conversation sample below are an example of unique voice and tone. Please learn the style and tone of the messages and use it when generating future responses:\n<VOICE_SAMPLE>\n${this.voiceSample.get(socket.id) || ''}\n</VOICE_SAMPLE>\n\nRespond naturally and briefly, like you're answering a phone call, using your unique voice and style. The current GMT time is ${new Date().toISOString()}.`;

      await this.sendPrompt(client, socket, greetingPrompt, false);
      this.startIdleTimer(client, socket);
    });

    // Handle WebSocket disconnection
    client.on('close', async (event) => {
      logger.log(`WebSocket closed for socket ${socket.id}, error: ${event.error}`);
      if (!event.error && !this.isReconnecting.get(socket.id)) {
        // Only handle disconnection if we're not already reconnecting
        await this.handleDisconnection(socket, client);
      }
    });

    client.on('error', async (event) => {
      logger.error(`WebSocket error for socket ${socket.id}:`, event.error);
      // Only handle disconnection if we're not already reconnecting and it's not a concurrent response error
      if (!this.isReconnecting.get(socket.id) && 
          !event.error.message?.includes('Conversation already has an active response')) {
        await this.handleDisconnection(socket, client);
      }
    });

    // Track when AI starts responding
    client.on('response.created', () => {
      logger.log('AI starting response');
      this.aiResponding.set(socket.id, true);
      this.clearIdleTimer(socket);
    });

    // Track when AI finishes responding
    client.on('response.done', () => {
      logger.log('AI response done');
      this.aiResponding.set(socket.id, false);
      // Don't start the idle timer yet if audio is still playing
      if (!this.audioPlaying.get(socket.id)) {
        this.startIdleTimer(client, socket);
      }
    });

    // Track audio playback start
    client.on('response.audio.delta', ({delta}) => {
      if (this.isInteractive.get(socket.id)) {
        this.audioPlaying.set(socket.id, true);
        this.clearIdleTimer(socket);
      }
    });

    socket.on('audioPlaybackComplete', (trackId) => {
      logger.log(`Audio playback complete for track ${trackId}`);
      this.audioPlaying.set(socket.id, false);
      // Only start idle timer if AI is also done responding
      if (!this.aiResponding.get(socket.id)) {
        this.startIdleTimer(client, socket);
      }
    });

    socket.on('appendAudio', (audio: string) => {
      // if it's the first message or has been over 60 seconds since we talked to the user, block audio while we're talking to avoid echoes
      const timeSinceLastMessage = Date.now() - (this.lastUserMessageTime.get(socket.id) || 0);
      const isPlaying = this.audioPlaying.get(socket.id) || this.aiResponding.get(socket.id);
      
      // Don't process audio if we're disconnected/reconnecting
      if (this.isReconnecting.get(socket.id)) {
        return;
      }

      if (!isPlaying || timeSinceLastMessage < SocketServer.AUDIO_BLOCK_TIMEOUT_MS) {
        try {
          client.appendInputAudio(audio);
        } catch (error: any) {
          logger.error(`Error appending audio: ${error.message}`);
          if (error.message === 'Not connected') {
            this.handleDisconnection(socket, client);
          }
        }
      }
    });

    client.on('input_audio_buffer.speech_started', () => {
      this.userSpeaking.set(socket.id, true);
      if (this.audioPlaying.get(socket.id)) {
        logger.log('Interrupting audio playback due to user speaking');
        socket.emit('conversationInterrupted');
      }
      this.isInteractive.set(socket.id, true);
      this.clearIdleTimer(socket);
    });

    client.on('input_audio_buffer.cancelled', () => {
      this.userSpeaking.set(socket.id, false);
      this.resetIdleCycles(socket);
      this.startIdleTimer(client, socket);
    });

    client.on('input_audio_buffer.committed', () => {
      this.userSpeaking.set(socket.id, false);
      this.isInteractive.set(socket.id, true);
      logger.log('Audio input committed, resetting idle timer and cycles');
      this.resetIdleCycles(socket);
      this.startIdleTimer(client, socket);
    });

    socket.on('sendMessage', (message: string) => {
      if (message) {
        logger.log('User sent message, resetting idle timer and cycles');
        //this.resetIdleCycles(socket);
        this.startIdleTimer(client, socket);
        this.sendUserMessage(client, message, true);
      }
    });
    
    socket.on('cancelResponse', () => {
      logger.log('User cancelled response, resetting idle timer and cycles');
      this.aiResponding.set(socket.id, false);
      this.audioPlaying.set(socket.id, false);
      this.resetIdleCycles(socket);
      this.startIdleTimer(client, socket);
      client.cancelResponse();
    });

    socket.on('conversationCompleted', async () => {
      logger.log('Conversation completed, clearing idle timer');
      this.cleanup(socket);
    });
    
    // Handle cleanup and client disconnect before socket closes
    socket.on('disconnecting', async (reason) => {
      logger.log('Socket disconnecting', socket.id, reason);
      this.cleanup(socket);
      this.functionCallStates.delete(socket.id);
      await client.disconnect();
    });

    // Log the final disconnect event
    socket.on('disconnect', (reason) => {
      logger.log('Socket disconnected', socket.id, reason);
    });

    await this.connectClient(socket, client);
  }

  async connectClient(socket: Socket<ClientToServerEvents,
                        ServerToClientEvents,
                        InterServerEvents,
                        SocketData>,
                      client: RealtimeVoiceClient) {
    const tools = new Tools(client, socket, this);
    client.on('error', (event) => {
      logger.error(`Client error: ${event.error.message}`);
      socket.emit('error', event.error.message);
    });
    client.on('close', () => {
    });
    client.on('conversation.item.deleted', ({item_id}) => {
      logger.log(`Successfully deleted conversation item: ${item_id}`);
    });
    client.on('conversation.item.created', ({item}) => {
      switch (item.type) {
        case 'function_call_output':
          // Don't release the lock here - wait for execution to complete
          break;
          
        case 'function_call':
          const callState = this.getFunctionCallState(socket.id);
          if (!callState.currentCallId) {
            callState.currentCallId = item.call_id;
            this.clearIdleTimer(socket);
          } else {
            logger.log(`Skipping new function call ${item.call_id} while call ${callState.currentCallId} is in progress`);
            client.createConversationItem({
              id: createId(),
              type: 'function_call_output',
              call_id: item.call_id,
              output: JSON.stringify({ error: "Function call skipped - another function call is in progress" })
            });
          }
          break;
          
        case 'message':
          // Track all audio messages (both user input_audio and assistant audio)
          console.log('conversation.item.created', item);
          if (this.isAudioMessage(item)) {
            this.manageAudioMessages(socket, client, item.id);
          }
          socket.emit('conversationUpdated', item, {});
          break;
      }
    });
    client.on('conversation.item.input_audio_transcription.completed',
      async ({item_id, transcript}) => {
        if (transcript) {
          const currentTime = this.lastUserMessageTime.get(socket.id) || 0;
          this.lastUserMessageTime.set(socket.id, 
            currentTime === 0 ? Date.now() - SocketServer.AUDIO_BLOCK_TIMEOUT_MS : Date.now()
          );
          const item = client.getItem(item_id);
          item && socket.emit('conversationUpdated', item, {});
          const cortexHistory = tools.getCortexHistory();
          await this.searchMemory(client, socket, cortexHistory);
        }
      });
    client.on('response.function_call_arguments.done', async (event) => {
      const callState = this.getFunctionCallState(socket.id);

      if (!callState.currentCallId) {
        logger.error('Function call arguments completed but no call is registered, skipping', socket.id);
        return;
      }

      if (callState.currentCallId !== event.call_id) {
        logger.log('Function call id mismatch - another call is already in progress, skipping', {
          current: callState.currentCallId,
          attempted: event.call_id
        });
        return;
      }
      
      try {
        this.clearIdleTimer(socket);
        //this.resetIdleCycles(socket);
        await this.executeFunctionCall(socket, tools, event, client);
      } catch (error) {
        logger.error('Function call failed:', error);
        callState.currentCallId = null;
      }
    });
    client.on('response.output_item.added', ({item}) => {
      if (item.type === 'message') {
        socket.emit('conversationUpdated', item, {});
      }
    });
    client.on('response.output_item.done', async ({item}) => {
      if (item.type !== 'message') {
        return;
      }
      if (item.content && item.content[0]) {
        socket.emit('conversationUpdated', item, {});
        // Track assistant audio messages
        if (this.isAudioMessage(item)) {
          this.manageAudioMessages(socket, client, item.id);
        }
        const cortexHistory = tools.getCortexHistory();
        //this.searchMemory(client, socket, cortexHistory);
        manageMemory(socket.data.userId, socket.data.aiName, cortexHistory);
      }
    });
    client.on('response.audio_transcript.delta', ({item_id, delta}) => {
      const item = client.getItem(item_id);
      item && socket.emit('conversationUpdated', item, {transcript: delta});
    });
    client.on('response.text.delta', ({item_id, delta}) => {
      const item = client.getItem(item_id);
      item && socket.emit('conversationUpdated', item, {text: delta});
    });
    client.on('response.audio.delta', ({item_id, delta}) => {
      if (this.isInteractive.get(socket.id)) {
        const item = client.getItem(item_id);
        item && socket.emit('conversationUpdated', item, {audio: delta});
      }
    });
    client.on('conversation.item.truncated', () => {
      this.audioPlaying.set(socket.id, false);
      this.aiResponding.set(socket.id, false);
      this.isInteractive.set(socket.id, false);
      socket.emit('conversationInterrupted');
    });

    // Connect to OpenAI Realtime API
    try {
      logger.log(`Connecting to OpenAI...`);
      await client.connect();
    } catch (e: any) {
      logger.error(`Error connecting to OpenAI: ${e.message}`);
      await this.io?.close();
      return;
    }
  }

  protected async searchMemory(client: RealtimeVoiceClient,
                              socket: Socket<ClientToServerEvents,
                                ServerToClientEvents,
                                InterServerEvents,
                                SocketData>,
                              cortexHistory: ChatMessage[]) {
    const searchResponse = await searchMemory(socket.data.userId, socket.data.aiName, cortexHistory, MemorySection.memoryAll);
    if (searchResponse?.result) {
      const memoryText = `<INSTRUCTIONS>Here are some memories that may be relevant:\n${searchResponse.result}\nThe current date and time in GMT is ${new Date().toISOString()}.</INSTRUCTIONS>`;
      this.sendUserMessage(client, memoryText, false);
    }
  }
    
  protected async fetchMemory(client: RealtimeVoiceClient,
                              socket: Socket<ClientToServerEvents,
                                ServerToClientEvents,
                                InterServerEvents,
                                SocketData>,
                              writeToConversation: MemorySection[] = []) {

    // Parallelize memory reads
    const [memorySelf, memoryUser, memoryDirectives, memoryTopics, voiceSample] = await Promise.all([
      readMemory(socket.data.userId, socket.data.aiName, "memorySelf", 1),
      readMemory(socket.data.userId, socket.data.aiName, "memoryUser", 1),
      readMemory(socket.data.userId, socket.data.aiName, "memoryDirectives", 1),
      readMemory(socket.data.userId, socket.data.aiName, "memoryTopics", 0, 0, 10),
      style(socket.data.userId, socket.data.aiName, socket.data.aiStyle, [], "")
    ]);

    if (writeToConversation.length > 0) {
      // If memoryAll is present, we'll send all sections
      const sectionsToSend = writeToConversation.includes('memoryAll') ? 
        ['memorySelf', 'memoryUser', 'memoryDirectives', 'memoryTopics'] as const : 
        writeToConversation;

      const memoryMessages: Record<Exclude<MemorySection, 'memoryAll'>, string> = {
        memorySelf: MEMORY_MESSAGE_SELF.replace('{{memorySelf}}', memorySelf?.result || ''),
        memoryUser: MEMORY_MESSAGE_USER.replace('{{memoryUser}}', memoryUser?.result || ''),
        memoryDirectives: MEMORY_MESSAGE_DIRECTIVES.replace('{{memoryDirectives}}', memoryDirectives?.result || ''),
        memoryTopics: MEMORY_MESSAGE_TOPICS.replace('{{memoryTopics}}', memoryTopics?.result || '')
      };

      // Send the requested sections
      sectionsToSend.forEach(section => {
        if (section in memoryMessages) {
          this.sendUserMessage(client, memoryMessages[section as keyof typeof memoryMessages], false);
        }
      });
    }

    return {
      memorySelf: memorySelf?.result || '',
      memoryUser: memoryUser?.result || '',
      memoryDirectives: memoryDirectives?.result || '',
      memoryTopics: memoryTopics?.result || '',
      voiceSample: voiceSample?.result || ''
    };
  }

  protected async updateSession(client: RealtimeVoiceClient,
                                socket: Socket<ClientToServerEvents,
                                  ServerToClientEvents,
                                  InterServerEvents,
                                  SocketData>) {

    const memory = await this.fetchMemory(client, socket, ['memoryTopics']);

    const instructions = INSTRUCTIONS
      .replace('{{aiName}}', socket.data.aiName)
      .replace('{{now}}', new Date().toISOString())
      .replace('{{language}}', 'English')
      .replace('{{voiceSample}}', memory?.voiceSample || '')
      .replace('{{memorySelf}}', memory?.memorySelf || '')
      .replace('{{memoryUser}}', memory?.memoryUser || '')
      .replace('{{memoryDirectives}}', memory?.memoryDirectives || '');

    this.voiceSample.set(socket.id, memory?.voiceSample || '');

    try {
      // First try updating everything including voice
      await client.updateSession({
        instructions,
        modalities: ['audio', 'text'],
        voice: (socket.handshake.query.voice as string || 'alloy') as Voice,
        input_audio_transcription: {model: 'whisper-1'},
        turn_detection: {type: 'server_vad', silence_duration_ms: 1500},
        tools: Tools.getToolDefinitions()
      });
    } catch (error: any) {
      if (error.message?.includes('Cannot update a conversation\'s voice')) {
        // If voice update fails, try updating without voice
        logger.log('Could not update voice, updating other session parameters');
        await client.updateSession({
          instructions,
          modalities: ['audio', 'text'],
          input_audio_transcription: {model: 'whisper-1'},
          turn_detection: {type: 'server_vad', silence_duration_ms: 1500},
          tools: Tools.getToolDefinitions()
        });
      } else {
        // If it's some other error, throw it
        throw error;
      }
    }
  }

  protected sendUserMessage(client: RealtimeVoiceClient, message: string, response: boolean = true) {
    // Find the socket associated with this client
    const socket = this.io?.sockets.sockets.get(Array.from(this.io.sockets.sockets.keys())[0]);
    if (!socket) {
      logger.error('No socket found for message send');
      return;
    }

    // If we're reconnecting, queue the message
    if (this.isReconnecting.get(socket.id)) {
      const queue = this.messageQueue.get(socket.id) || [];
      queue.push({ message, response });
      this.messageQueue.set(socket.id, queue);
      return;
    }

    try {
      client.createConversationItem({
        id: createId(),
        type: 'message',
        role: 'user',
        status: 'completed',
        content: [
          {
            type: `input_text`,
            text: message,
          },
        ],
      });
      if (response) {
        try {
          client.createResponse({});
        } catch (error: any) {
          // If we get a concurrent response error, just log it and continue
          if (error.message?.includes('Conversation already has an active response')) {
            logger.log('Skipping response creation - conversation already has active response');
            return;
          }
          throw error;
        }
      }
    } catch (error: any) {
      logger.error(`Error sending user message: ${error.message}`);
      if (error.message === 'Not connected') {
        // Queue the failed message
        const queue = this.messageQueue.get(socket.id) || [];
        queue.push({ message, response });
        this.messageQueue.set(socket.id, queue);
        
        this.handleDisconnection(socket, client);
      }
    }
  }

  private isAudioMessage(item: any): boolean {
    return item.type === 'message' && item.content?.some((c: { type: string }) => 
      c.type === 'input_audio' || c.type === 'audio'
    );
  }

  private manageAudioMessages(socket: Socket, client: RealtimeVoiceClient, newItemId: string) {
    const audioMessages = this.audioMessages.get(socket.id) || [];
    audioMessages.push(newItemId);
    logger.log('manageAudioMessages', audioMessages);
    this.audioMessages.set(socket.id, audioMessages);

    // If we have more than MAX_AUDIO_MESSAGES, remove the oldest ones
    if (audioMessages.length > SocketServer.MAX_AUDIO_MESSAGES) {
      const itemsToRemove = audioMessages.slice(0, audioMessages.length - SocketServer.MAX_AUDIO_MESSAGES);
      logger.log(`Attempting to remove ${itemsToRemove.length} old audio messages`);
      for (const oldItemId of itemsToRemove) {
        try {
          client.deleteConversationItem(oldItemId);
          logger.log(`Sent delete request for item: ${oldItemId}`);
        } catch (error) {
          logger.error(`Failed to delete conversation item ${oldItemId}:`, error);
          // Keep the item in our tracking if delete failed
          continue;
        }
      }
      // Update the tracked items only after attempting deletion
      this.audioMessages.set(socket.id, audioMessages.slice(-SocketServer.MAX_AUDIO_MESSAGES));
    }
  }

  private getFunctionCallState(socketId: string) {
    if (!this.functionCallStates.has(socketId)) {
      this.functionCallStates.set(socketId, {
        currentCallId: null
      });
      logger.log(`Initialized function call state for socket ${socketId}`);
    }
    return this.functionCallStates.get(socketId)!;
  }

  private async executeFunctionCall(socket: Socket, tools: Tools, event: any, client: RealtimeVoiceClient) {
    const state = this.getFunctionCallState(socket.id);
    try {
      // Verify this is still the current function call
      if (state.currentCallId !== event.call_id) {
        logger.error('Function call mismatch in execution', {
          current: state.currentCallId,
          attempted: event.call_id
        });
        return;
      }

      // Set up timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Function call timed out'));
        }, SocketServer.FUNCTION_CALL_TIMEOUT_MS);
      });

      // Execute the function call with timeout
      await Promise.race([
        tools.executeCall(event.call_id, event.name, event.arguments, socket.data.userId, socket.data.aiName),
        timeoutPromise
      ]);

      // Reset state on success
      state.currentCallId = null;

      // Only reset idle cycles in interactive mode
      if (this.isInteractive.get(socket.id)) {
        this.resetIdleCycles(socket);
      }
      this.startIdleTimer(client, socket);

    } catch (error: any) {
      logger.error('Function call failed:', error);
      socket.emit('error', error.message);
      // Reset state on error
      state.currentCallId = null;
      // Even in non-interactive mode, restart timer on error to prevent rapid error loops
      this.startIdleTimer(client, socket);
      throw error;
    }
  }

  // Add this method for the MuteAudio tool to use
  public setInteractiveState(socket: Socket, interactive: boolean) {
    this.isInteractive.set(socket.id, interactive);
    logger.log(`Set interactive state to ${interactive} for socket ${socket.id}`);
  }
}
