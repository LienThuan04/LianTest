'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
test('print view does not insert a student event handler into raw HTML', () => {
  const template=fs.readFileSync(path.resolve(__dirname,'../../views/pages/export_pdf.ejs'),'utf8');
  const html=ejs.render(template,{Title:'Test',info:{hoten:'Fixture',manguoidung:'s1',tende:'Exam',tenmonhoc:'Test'},diem:0,thoigianthi:'1 phút',thoigianlambai:'1 phút',blocks:[{type:'essay',questions:[{
    stt:1,noidung:'Essay',noidung_tra_loi:'<p><strong>Answer</strong></p><img src="invalid" onerror="alert(1)">',hinhanh_list:[],diem_cham_tuluan:0,
  }]}]});
  assert.doesNotMatch(html, /<img[^>]+onerror=/i);
});
