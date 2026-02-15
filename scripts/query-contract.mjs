const ADDRESS = "10dbb900e355b98cf2b395e60228795e7189b7b845d9915ab2854a21da95bbbb";

const resp = await fetch('http://127.0.0.1:8088/api/v3/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `query ($address: HexEncoded!) {
      contractAction(address: $address) {
        address
        state
      }
    }`,
    variables: { address: ADDRESS }
  })
});
const data = await resp.json();
console.log(JSON.stringify(data, null, 2));
