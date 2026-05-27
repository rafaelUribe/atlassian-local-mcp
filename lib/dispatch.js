const handlers = {
  ...require('./handlers/jira'),
  ...require('./handlers/confluence'),
  ...require('./handlers/bitbucket'),
  ...require('./handlers/cache-mcp'),
};

function dispatchTool(id, name, args, respondFn) {
  const send    = (i, text) => respondFn(i, { content: [{ type: 'text', text }] });
  const sendErr = (i, err)  => respondFn(i, { isError: true, content: [{ type: 'text', text: err.message }] });
  const handler = handlers[name];
  if (handler) return handler(id, args, send, sendErr);
  send(id, `Unknown tool: ${name}`);
}

module.exports = { dispatchTool };
