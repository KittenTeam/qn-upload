const path = require('path')
const globby = require('globby')

const config = require('./prepare')
const logger = require('./logger')
const { uploadAllFiles } = require('./upload')

const { dest } = config

module.exports = async function(files) {
  if (!files) {
    files = await globby(['**/*'], { cwd: dest })
  }
  if (!files.length) {
    return logger.warn('指定上传的目录没有文件')
  }
  uploadAllFiles(files)
}
