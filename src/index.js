// 入口：require 一个会被外部修改的模块（模拟 watch 增量场景）。
const value = require('./dep.js')
module.exports = { value }
