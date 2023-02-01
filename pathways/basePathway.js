const { parseResponse } = require("../graphql/parser");
const { rootResolver, resolver } = require("../graphql/resolver");
const { typeDef } = require('../graphql/typeDef')

// all default definitions of a single pathway
module.exports = {
    prompt: `{{text}}`,
    defaultInputParameters: {
        text: ``,
        // Add the option of making every call async
        async: false,
    },
    inputParameters: {},
    typeDef,
    rootResolver,
    resolver,
    useInputChunking: true,
}
