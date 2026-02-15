const resp = await fetch('http://127.0.0.1:8088/api/v3/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `{
      __type(name: "ContractAction") {
        fields {
          name
          type { name kind ofType { name kind ofType { name } } }
        }
      }
    }`
  })
});
const data = await resp.json();
console.log(JSON.stringify(data.data.__type.fields, null, 2));
