/**
 * Pino ロガー設定
 * - 本番: JSON出力、infoレベル
 * - 開発: pino-pretty カラー出力、debugレベル
 */

const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: isProduction ? 'info' : 'debug',
  hooks: {
    // console.log('msg:', val) 風の複数文字列引数を連結する
    // Pinoデフォルトでは第2引数以降の文字列が消えるため必要
    logMethod(inputArgs, method) {
      if (inputArgs.length >= 2 && typeof inputArgs[0] === 'string') {
        const strings = inputArgs.map(a =>
          typeof a === 'string' ? a : (a instanceof Error ? a.message : String(a))
        );
        return method.apply(this, [strings.join(' ')]);
      }
      return method.apply(this, inputArgs);
    }
  },
  ...(!isProduction && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  })
});

/**
 * モジュール別の子ロガーを生成
 * @param {string} moduleName - モジュール名
 * @returns {import('pino').Logger}
 */
function createModuleLogger(moduleName) {
  return logger.child({ module: moduleName });
}

module.exports = { logger, createModuleLogger };
