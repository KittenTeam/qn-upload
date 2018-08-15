const fs = require('fs')
const path = require('path')
const qiniu = require('qiniu')
const rp = require('request-promise-native')
const createHash = require('crypto').createHash

const config = require('./prepare')
const logger = require('./logger')

const md5 = input => {
  return createHash('md5')
    .update(input)
    .digest('hex')
}

const {
  accessKey,
  secretKey,
  zone,
  prefix,
  bucket,
  dest,
  overwrite,
  callback
} = config
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey)
const qnConfig = getQnconfig()
const formUploader = new qiniu.form_up.FormUploader(qnConfig)
const putExtra = new qiniu.form_up.PutExtra()
const bucketManager = new qiniu.rs.BucketManager(mac, qnConfig)

const uploadedFile = 'uploaded.json'
let uploaded
let uploadedFileExit = false
let uploadCount = 0
try {
  uploaded = JSON.parse(fs.readFileSync(uploadedFile))
  uploadedFileExit = true
} catch (error) {
  uploaded = {}
}

function getNormalToken() {
  const options = {
    scope: bucket,
    detectMime: 1
  }
  const putPolicy = new qiniu.rs.PutPolicy(options)
  const uploadToken = putPolicy.uploadToken(mac)
  return uploadToken
}

function getOverwriteToken(key) {
  const options = {
    scope: bucket + ':' + key,
    detectMime: 1
  }
  const putPolicy = new qiniu.rs.PutPolicy(options)
  const uploadToken = putPolicy.uploadToken(mac)
  return uploadToken
}

function getQnconfig() {
  const qnConfig = new qiniu.conf.Config()
  // 空间对应的机房
  qnConfig.zone = getZone(zone)
  // 上传是否使用cdn加速
  config.useCdnDomain = false
  return qnConfig
}

function getZone(key) {
  const map = {
    ECN: 'Zone_z0', // 华东
    NCN: 'Zone_z1', // 华北
    SCN: 'Zone_z2', // 华南
    NA: 'Zone_na0' // 北美
  }
  return qiniu.zone[map[key]]
}

// 保存当次已上传的文件，主要应对因错误造成的文件上传异常，模拟断点续传
function saveStatus() {
  fs.writeFileSync(uploadedFile, JSON.stringify(uploaded))
}

function upload(localFile, uploadToken) {
  return new Promise((resolve, reject) => {
    const localPath = path.resolve(process.cwd(), dest, localFile)
    const remotePath = prefix + localFile
    formUploader.putFile(uploadToken, remotePath, localPath, putExtra, function(
      respErr,
      respBody,
      respInfo
    ) {
      if (respErr) {
        saveStatus()
        throw respErr
      }
      if (respInfo.statusCode === 200) {
        uploadCount++
        console.log(`file '${localFile}' upload success`)
      } else {
        respBody.file = localFile
        logger.warn(
          `错误号${respInfo.statusCode} : ${JSON.stringify(respBody)}`
        )
      }
      resolve()
    })
  })
}

// function changeMime(remotePath, newMime) {
//   return new Promise((resolve, reject) => {
//     bucketManager.changeMime(bucket, remotePath, newMime, function(
//       err,
//       respBody,
//       respInfo
//     ) {
//       if (err) {
//         saveStatus()
//         throw err
//       } else {
//         if (respInfo.statusCode === 200) {
//           console.log(`file '${remotePath}' change mime type success`)
//           resolve()
//         } else {
//           logger.warn(
//             `错误号${respInfo.statusCode} : ${JSON.stringify(respBody)}`
//           )
//           reject()
//         }
//       }
//     })
//   })
// }

async function fileShouldDo(localFile) {
  const remotePath = prefix + localFile
  const remoreFileIsExit = await remoreFileExit(remotePath)
  let shouldUpload = true
  let shouldOverwrite = false
  if (remoreFileIsExit) {
    shouldUpload = false
    if (overwrite instanceof RegExp) {
      shouldOverwrite = overwrite.test(remotePath)
    }
    if (overwrite instanceof Function) shouldOverwrite = !!overwrite(remotePath)
    if (overwrite instanceof Boolean) shouldOverwrite = overwrite
    if (shouldOverwrite) shouldUpload = true
  }
  return { shouldUpload, shouldOverwrite }
}

function remoreFileExit(remotePath) {
  return new Promise((resolve, reject) => {
    bucketManager.stat(bucket, remotePath, function(err, respBody, respInfo) {
      if (err) {
        saveStatus()
        throw err
      } else {
        if (respInfo.statusCode === 612) {
          resolve(false)
        } else {
          resolve(true)
        }
      }
    })
  })
}

exports.uploadAllFiles = async function(files) {
  const normalToken = getNormalToken()
  for (const file of files) {
    const localPath = path.resolve(process.cwd(), dest, file)
    const remotePath = prefix + file
    const fileContentHash = md5(fs.readFileSync(localPath)).slice(0, 5)
    const uploadedFile = uploaded[file]
    if (!uploadedFile || uploadedFile !== fileContentHash) {
      const { shouldUpload, shouldOverwrite } = await fileShouldDo(file)
      if (shouldUpload) {
        await upload(
          file,
          shouldOverwrite ? getOverwriteToken(remotePath) : normalToken
        )
        uploaded[file] = fileContentHash
      }
    }
  }
  console.log() // 空行，美观需要
  logger.success(`文件上传完毕, 上传文件数: ${uploadCount}`)
  if (callback) {
    if (typeof callback === 'string') {
      rp(callback)
    } else if (typeof callback === 'function') {
      callback()
    }
  }
  if (uploadedFileExit) fs.unlinkSync(uploadedFile)
}
