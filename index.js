'use strict';

const { ApolloServer, gql, ApolloError } = require('apollo-server');
const axios = require('axios');
const xmlParser = require('fast-xml-parser');
const stabikatApiEndpoint = 'http://stabikat.de/DB=1/XML=1.0/PRS=XML/XMLSAVE=N/CMD?ACT=SRCHA&IKT=1016&SRT=YOP';

/* schema */
const typeDefs = gql`
  type Title {
    name: String
    ppn: String
  }

  type Query {
    titles(query: String!, rows: Int): [Title]
    title(ppn: String!): Title
  }
`;

/* resolver map */
const resolvers = {
  Query: {
    async title(obj, args, context, info) {
        return await getTitle(args.ppn);
    },
    async titles(obj, args, context, info) {
        return await getTitles(args.query, args.rows);
    }
  },
  Title: {
    name(parentObject, args, context) {
      const {name} = parentObject;
      return Array.isArray(name) ? name.find((sub) => sub['@_code'] === 'a')['#text'] : name['#text'];
    }
  }
};

/* fetch a single item */
async function getTitle(ppn = '') {
    const xmlData = await axios.get(`http://stabikat.de/DB=1/XML=1.0/PRS=XML/XMLSAVE=N/PPN?PPN=${ppn}`);
    const jsonData = xmlParser.parse(xmlData.data, { ignoreAttributes: false });
    let dataObj = {};

    if (
        jsonData.RESULT.hasOwnProperty('LONGTITLE') &&
        jsonData.RESULT.LONGTITLE.hasOwnProperty('record')
    ) {
        dataObj.name = jsonData.RESULT.LONGTITLE.record.datafield.find((objj) => objj['@_tag'] === '021A')['subfield'];
        dataObj.ppn = jsonData.RESULT.LONGTITLE['@_id'];
    }
    else {
        throw new ApolloError('PPN not found');
    }

    return dataObj;
}

/* fetch results by search query */
async function getTitles(query = '', rows = 10) {
    const xmlData = await axios.get(`${stabikatApiEndpoint}&TRM=${query}&SHRTST=${rows}`);
    const jsonData = xmlParser.parse(xmlData.data, { ignoreAttributes: false });
    let dataArray = [];

    if (Array.isArray(jsonData.RESULT.SET.SHORTTITLE)) {
        jsonData.RESULT.SET.SHORTTITLE.forEach(function(obj) {
            dataArray.push({
                name: obj.record.datafield.find((objj) => objj['@_tag'] === '021A')['subfield'],
                ppn: obj['@_PPN']
            });
        });
    }
    else {
        dataArray.push({
            name: jsonData.RESULT.SET.SHORTTITLE.record.datafield.find((objj) => objj['@_tag'] === '021A')['subfield'],
            ppn: jsonData.RESULT.SET.SHORTTITLE['@_PPN']
        });
    }

    return dataArray;
}

/* start server */
const server = new ApolloServer({ typeDefs, resolvers, introspection: true, playground: true });
server.listen().then(({ url }) => {
  console.log(`... Server listening @ ${url}`);
});
