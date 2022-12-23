const PathwayPrompter = require('./pathwayPrompter');
const nlp = require('compromise')
const plugin = require('compromise-paragraphs');
const { parseNumberedList } = require("./parser");

nlp.extend(plugin)

class PathwayResolver {
    constructor({ config, pathway }) {
        this.pathwayPrompt = pathway.prompt;
        this.responseParser = pathway.parser;
        this.enableChunking = pathway.chunk;
        this.returnType = pathway.returnType?.type ?? 'string';

        this.pathwayPrompter = new PathwayPrompter({ config, pathway });
    }

    async resolve(args) {
        const data = await this.processRequest(args, this.enableChunking);

        if (this.responseParser) {
            return await this.responseParser(
                data,
                (params) => this.processRequest(params, this.enableChunking));
        }

        if (this.returnType === 'list') {
            return parseNumberedList(data)
        }

        return data;
    }

    async processRequest({ text, ...parameters }, enableChunking) {
        // Chunk input into paragraphs if needed
        let paragraphs = enableChunking ?
            nlp(text).paragraphs().views.map(v => v.text()) :
            [text];

        // Normalize prompts to an array
        let prompts = Array.isArray(this.pathwayPrompt) ?
            this.pathwayPrompt :
            [this.pathwayPrompt];

        // To each paragraph of text, apply all prompts serially
        const data = await Promise.all(paragraphs.map(paragraph =>
            this.applyPromptsSerially(paragraph, parameters, prompts)));

        return data.join("\n\n");
    }

    async applyPromptsSerially(text, parameters, prompts) {
        let cumulativeText = text;
        for (const prompt of prompts) {
            cumulativeText = await this.pathwayPrompter.execute(cumulativeText, parameters, prompt);
        }
        return cumulativeText;
    }
}

module.exports = PathwayResolver;
