//@ts-check
import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import Module from "node:module"
import { dirname } from 'node:path'
import supportedVersions from '../src/supportedVersions.mjs'
import { gzipSizeFromFileSync } from 'gzip-size'
import fs from 'fs'
import  {default as _JsonOptimizer}  from '../src/optimizeJson'
import { buildSync } from 'esbuild'
import { gzipSync } from 'zlib';

/** @type {typeof _JsonOptimizer} */
//@ts-ignore
const JsonOptimizer = _JsonOptimizer.default

// console.log(a.diff_main(JSON.stringify({ a: 1 }), JSON.stringify({ a: 1, b: 2 })))

const require = Module.createRequire(import.meta.url)

const dataPaths = require('minecraft-data/minecraft-data/data/dataPaths.json')

function toMajor (version) {
  const [a, b] = (version + '').split('.')
  return `${a}.${b}`
}

const versions = {}
const dataTypes = new Set()

for (const [version, dataSet] of Object.entries(dataPaths.pc)) {
  if (!supportedVersions.includes(version)) continue
  for (const type of Object.keys(dataSet)) {
    dataTypes.add(type)
  }
  versions[version] = dataSet
}

const versionToNumber = (ver) => {
  const [x, y = '0', z = '0'] = ver.split('.')
  return +`${x.padStart(2, '0')}${y.padStart(2, '0')}${z.padStart(2, '0')}`
}

// if not included here (even as {}) will not be bundled & accessible!
const minifyTestOutput = false
// const dataTypeBundling = {
//   biomes: {
//     arrKey: 'name',
//     // ignoreRemoved: true,
//     // ignoreChanges: true
//   }
// }
const dataTypeBundling = {
  // language: {
  //   ignoreRemoved: true,
  //   ignoreChanges: true
  // },
  blocks: {
    arrKey: 'name',
    // ignoreRemoved: true,
    // genChanges (source, diff) {
    //   const diffs = {}
    //   const newItems = {}
    //   for (const [key, val] of Object.entries(diff)) {
    //     const src = source[key]
    //     if (!src) {
    //       newItems[key] = val
    //       continue
    //     }
    //     const { minStateId, defaultState, maxStateId } = val
    //     if (defaultState === undefined || minStateId === src.minStateId || maxStateId === src.maxStateId || defaultState === src.defaultState) continue
    //     diffs[key] = [minStateId, defaultState, maxStateId]
    //   }
    //   return {
    //     stateChanges: diffs
    //   }
    // },
    // ignoreChanges: true
  },
  items: {
    arrKey: 'name'
  },
  attributes: {
    arrKey: 'name'
  },
  particles: {
    arrKey: 'name'
  },
  effects: {
    arrKey: 'name'
  },
  enchantments: {
    arrKey: 'name'
  },
  instruments: {
    arrKey: 'name'
  },
  foods: {
    arrKey: 'name'
  },
  entities: {
    arrKey: 'id'
  },
  materials: {},
  windows: {
    arrKey: 'name'
  },
  version: {
    raw: true
  },
  tints: {},
  biomes: {
    arrKey: 'name'
  },
  entityLoot: {
    arrKey: 'name'
  },
  blockLoot: {
    arrKey: 'name'
  },
  recipes: {}, // todo
  blockCollisionShapes: {},
  loginPacket: {},
  protocol: {},
  sounds: {
    arrKey: 'name'
  }
}

const notBundling = [...dataTypes.keys()].filter(x => !Object.keys(dataTypeBundling).includes(x))
console.log("Not bundling minecraft-data data:", notBundling)

// let contents = 'Object.assign(window.mcData, {\n'
let previousData = {}
// /** @type {Record<string, JsonOptimizer>} */
const diffSources = {}
const versionsArr = Object.entries(versions)
const sizePerDataType = {}
const rawDataVersions = {}
// const versionsArr = Object.entries(versions).slice(-1)
for (const [i, [version, dataSet]] of versionsArr.reverse().entries()) {
  // console.log(i, '/', versionsArr.length)
  // contents += `    '${version}': {\n`
  for (const [dataType, dataPath] of Object.entries(dataSet)) {
    const config = dataTypeBundling[dataType]
    if (!config) continue
    if (dataType === 'blockCollisionShapes' && versionToNumber(version) >= versionToNumber('1.13')) {
      // contents += `      get ${dataType} () { return window.globalGetCollisionShapes?.("${version}") },\n`
      continue
    }
    const loc = `minecraft-data/data/${dataPath}/`
    const dataPathAbsolute = require.resolve(`minecraft-data/${loc}${dataType}`)
    // const data = fs.readFileSync(dataPathAbsolute, 'utf8')
    const dataRaw = require(dataPathAbsolute)
    let injectCode = ''
    let rawData = dataRaw
    if (config.raw) {
      rawDataVersions[dataType] ??= {}
      rawDataVersions[dataType][version] = rawData
      rawData = dataRaw
    } else {
      if (!diffSources[dataType]) {
        diffSources[dataType] = new JsonOptimizer(config.arrKey, config.ignoreChanges, config.ignoreRemoved)
      }
      try {
        diffSources[dataType].recordDiff(version, dataRaw)
        injectCode = `restoreDiff(sources, ${JSON.stringify(dataType)}, ${JSON.stringify(version)})`
      } catch (err) {
        const error = new Error(`Failed to diff ${dataType} for ${version}: ${err.message}`)
        error.stack = err.stack
        throw error
      }
    }
    sizePerDataType[dataType] ??= 0
    sizePerDataType[dataType] += Buffer.byteLength(JSON.stringify(injectCode || rawData), 'utf8')
    if (config.genChanges && previousData[dataType]) {
      const changes = config.genChanges(previousData[dataType], dataRaw)
      // Object.assign(data, changes)
    }
    previousData[dataType] = dataRaw
    // contents += `      get ${dataType} () { return ${injectCode || JSON.stringify(rawData)} },\n`
  }
  // contents += '    },\n'
}
// contents += '})'
const sources = Object.fromEntries(Object.entries(diffSources).map(x => {
  const data = x[1].export()
  // const data = {}
  sizePerDataType[x[0]] += Buffer.byteLength(JSON.stringify(data), 'utf8')
  return [x[0], data]
}))
Object.assign(sources, rawDataVersions)
// contents += `\n\nconst sources = ${JSON.stringify(sources, null, 4)}`

const totalSize = Object.values(sizePerDataType).reduce((acc, val) => acc + val, 0)
console.log('total size (mb)', totalSize / 1024 / 1024)
console.log(
  'size per data type (mb, %)',
  Object.fromEntries(Object.entries(sizePerDataType).map(([dataType, size]) => {
    return [dataType, [size / 1024 / 1024, Math.round(size / totalSize * 100)]];
  }).sort((a, b) => {
    //@ts-ignore
    return b[1][1] - a[1][1];
  }))
)

function compressToBase64(input) {
  const buffer = gzipSync(input);
  return buffer.toString('base64');
}

const filePath = './generated/minecraft-data-optimized.json'
fs.writeFileSync(filePath, JSON.stringify(sources), 'utf8')
if (minifyTestOutput) {
  const minizedCompressed = compressToBase64(fs.readFileSync(filePath))
  console.log('size of compressed', Buffer.byteLength(minizedCompressed, 'utf8') / 1000 / 1000)
  const compressedFilePath = './experiments/compressed.js'
  fs.writeFileSync(compressedFilePath, minizedCompressed, 'utf8')
}

console.log('size', fs.lstatSync(filePath).size / 1000 / 1000, gzipSizeFromFileSync(filePath) / 1000 / 1000)
