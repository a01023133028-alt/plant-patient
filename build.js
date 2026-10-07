// model.js 내용을 index.html 안에 복사해 넣습니다. (index.html 한 파일만으로도 열리게)
// model.js를 고친 뒤에는 꼭 `node build.js`를 실행하세요. test.js가 두 내용이 같은지 확인합니다.
'use strict';
var fs = require('fs'), path = require('path');
var START = '<script id="model-inline">', END = '</script><!-- /model-inline -->';
function inlined(html, model) {
  var a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < 0) throw new Error('index.html에서 model-inline 표시를 찾을 수 없습니다.');
  return html.slice(0, a + START.length) + '\n' + model + '\n' + html.slice(b);
}
module.exports = { inlined: inlined };
if (require.main === module) {
  var dir = __dirname, file = path.join(dir, 'index.html');
  var out = inlined(fs.readFileSync(file, 'utf8'), fs.readFileSync(path.join(dir, 'model.js'), 'utf8'));
  fs.writeFileSync(file, out);
  console.log('index.html에 model.js를 넣었습니다.');
}
