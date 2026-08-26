import type { Course } from '@/types';

const CN = ['一', '二', '三', '四', '五', '六', '七'];
const cnToNum = (c: string) => CN.indexOf(c) + 1;

/**
 * 從課程備註/年級推斷修課限制。
 * 回傳 { grad: 是否限研究所, minGrade: 大學部最低年級, label }
 */
export function getCourseRequirement(course: Course): {
  grad: boolean;
  minGrade: number | null;
  label: string;
} {
  const text = `${course.description || ''} ${course.grade || ''}`;
  let grad = false;
  let minGrade: number | null = null;
  const labels: string[] = [];

  if (/研究所|碩士|博士|碩班|博班/.test(text)) {
    grad = true;
    labels.push('研究所');
  }
  // 大三以上 / 大3以上
  const m = text.match(/大(?:([一二三四五六七])|([1-7]))\s*以上/);
  if (m) {
    minGrade = m[1] ? cnToNum(m[1]) : parseInt(m[2], 10);
    labels.push(`大${minGrade}以上`);
  }
  return { grad, minGrade, label: labels.join('、') };
}

/**
 * 依「我的年級」判斷是否可修。
 * myGrade：0=未設定, 1~4=大一~大四, 10=研究所
 */
export function getEligibility(
  course: Course,
  myGrade: number,
): { eligible: boolean; reason: string } {
  if (!myGrade) return { eligible: true, reason: '' };
  const req = getCourseRequirement(course);
  if (!req.grad && req.minGrade == null) return { eligible: true, reason: '' };

  const isGrad = myGrade === 10;
  // 限制為「白名單聯集」：符合任一條件即可修
  const okByGrad = req.grad && isGrad;
  const okByMin = req.minGrade != null && (isGrad || myGrade >= req.minGrade);
  if (okByGrad || okByMin) return { eligible: true, reason: '' };

  const parts: string[] = [];
  if (req.minGrade != null) parts.push(`大${req.minGrade}以上`);
  if (req.grad) parts.push('研究所');
  return { eligible: false, reason: `限${parts.join('／')}` };
}
