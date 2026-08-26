// 大同大學節次對照（key 需與爬蟲 SESSION_TO_CHAR 一致）
// SelSession 1-14 -> key 1..9,A..E
// 時間為常見排程，若與大同實際鐘聲不同可自行修改 value。
export const timeSlot = [
  { key: '1', value: '第1節\n08:10\n~\n09:00' },
  { key: '2', value: '第2節\n09:10\n~\n10:00' },
  { key: '3', value: '第3節\n10:10\n~\n11:00' },
  { key: '4', value: '第4節\n11:10\n~\n12:00' },
  { key: '5', value: '中午\n12:10\n~\n13:00' },
  { key: '6', value: '第5節\n13:10\n~\n14:00' },
  { key: '7', value: '第6節\n14:10\n~\n15:00' },
  { key: '8', value: '第7節\n15:10\n~\n16:00' },
  { key: '9', value: '第8節\n16:10\n~\n17:00' },
  { key: 'A', value: '傍晚\n17:10\n~\n18:00' },
  { key: 'B', value: '第9節\n18:20\n~\n19:10' },
  { key: 'C', value: '第10節\n19:15\n~\n20:05' },
  { key: 'D', value: '第11節\n20:10\n~\n21:00' },
  { key: 'E', value: '第12節\n21:05\n~\n21:55' },
];
