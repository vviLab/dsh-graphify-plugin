process.stdout.write('[graphify extract] scanning /tmp/sample\n')
setTimeout(() => {
  process.stdout.write('[graphify extract] found 12 code, 40 docs\n')
}, 5)
setTimeout(() => {
  process.stdout.write('[graphify extract] chunk 1/2 done\n')
}, 10)
setTimeout(() => {
  process.stdout.write('[graphify extract] wrote graphify-out/graph.json: 9 nodes, 7 edges\n')
  process.exit(0)
}, 20)
