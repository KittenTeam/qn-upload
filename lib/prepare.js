const fs = require('fs')
const logger = require('./logger')

const path = require('path')
const configPath = path.resolve(process.cwd(), 'qn-upload.config.js')
if (!fs.existsSync(configPath)) {
  logger.error('配置文件qn-upload.config.js不存在')
}

const config = require(configPath)
const mustString = [
  'accessKey',
  'zone',
  'secretKey',
  'prefix',
  'bucket',
  'dest'
]
mustString.forEach(v => {
  const value = config[v]
  if (!value) return logger.error(`配置项${v}不存在`)
  if (typeof value !== 'string') return logger.error(`配置项${v}必须是字符串`)
})

module.exports = config
