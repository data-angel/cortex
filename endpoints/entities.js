const { parseNumberedObjectList } = require("../parser")

module.exports = {
    temperature: 0,
    prompt: `{{text}}\n\nList the top {{count}} entities and their definitions for the above in format {{format}}:`,
    count: 5,
    // format: `(number. entity: definition)`, 
    parser: (text) => {
        parseNumberedObjectList(text, ["entity", "definition"])
    },
    typeDef: {
        type: `    
            type Entity {
                name: String,
                definition: String
            }`,
        label: `entities(text: String!): [Entity],`
    },
    // resolver: 
}