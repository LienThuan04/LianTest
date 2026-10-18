// @ts-check
/** @typedef {{id:string, prompt:string, options:ReadonlyArray<string>, correctIndex:number, explanation:string}} DemoQuestion */
/** @type {ReadonlyArray<DemoQuestion>} */
export const demoQuestions = [
  { id: 'not-found', prompt: 'HTTP status nào cho biết tài nguyên không được tìm thấy?', options: ['200', '201', '404', '500'], correctIndex: 2, explanation: '404 Not Found cho biết máy chủ không tìm thấy tài nguyên được yêu cầu.' },
  { id: 'created', prompt: 'HTTP status nào thường được trả về khi tạo thành công một tài nguyên?', options: ['200', '201', '403', '500'], correctIndex: 1, explanation: '201 Created cho biết yêu cầu đã tạo thành công một tài nguyên mới.' },
  { id: 'unauthorized', prompt: 'HTTP status nào cho biết yêu cầu chưa có thông tin xác thực hợp lệ?', options: ['401', '200', '301', '404'], correctIndex: 0, explanation: '401 Unauthorized được dùng khi yêu cầu thiếu thông tin xác thực hợp lệ.' },
];

/** @param {ReadonlyArray<number|null>} answers @returns {{correct:number,total:number}} */
export function calculateDemoResult(answers) {
  return { correct: demoQuestions.filter((question, index) => answers[index] === question.correctIndex).length, total: demoQuestions.length };
}
