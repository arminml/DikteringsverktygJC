// These tests must not contact any paid service, even with SEND_ENABLED=true.
globalThis.fetch=async()=>{throw new Error('External network is forbidden in demo integration tests');};
