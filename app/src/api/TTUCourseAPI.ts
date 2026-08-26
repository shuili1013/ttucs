import { AcademicYear, Course, SemesterUpdate } from '@/types';

/**
 * 資料來源 base：
 * - 開發/自架：預設讀本機 public/data/ 底下的靜態 JSON（由爬蟲產生）
 * - 正式：設定 VITE_API_BASE 指向已發佈的資料站（例如 GitHub Pages）
 */
const BASE_URL =
  import.meta.env.VITE_API_BASE ?? `${import.meta.env.BASE_URL}data`;

export class TTUCourseAPI {
  /** 取得所有可用學期列表 */
  static async getAvailableSemesters(): Promise<AcademicYear> {
    const response = await fetch(`${BASE_URL}/version.json`);
    if (!response.ok) throw new Error('Failed to fetch available semesters');
    return response.json();
  }

  /** 取得指定學年度的學期更新資訊 */
  static async getSemesterUpdates(
    academicYear: string,
  ): Promise<SemesterUpdate> {
    const response = await fetch(`${BASE_URL}/${academicYear}/version.json`);
    if (!response.ok) throw new Error('Failed to fetch semester updates');
    return response.json();
  }

  /** 取得指定學年度、更新時間的所有課程 */
  static async getCourses(
    academicYear: string,
    updateTime: string,
  ): Promise<Course[]> {
    const response = await fetch(
      `${BASE_URL}/${academicYear}/${updateTime}/all.json`,
    );
    if (!response.ok) throw new Error('Failed to fetch courses');

    return response.json().then((courses: Course[]) => {
      // 依 id 去重（保留第一筆）
      return Array.from(new Set(courses.map((c) => c.id))).map(
        (id) => courses.find((c) => c.id === id)!,
      );
    });
  }

  /** 取得最新學期的所有課程 */
  static async getLatestCourses(): Promise<Course[]> {
    const semesters = await TTUCourseAPI.getAvailableSemesters();
    const latestAcademicYear = semesters.latest;
    const updates = await TTUCourseAPI.getSemesterUpdates(latestAcademicYear);
    const latestUpdateTime = updates.latest;
    return TTUCourseAPI.getCourses(latestAcademicYear, latestUpdateTime);
  }
}

// 舊名稱相容別名，避免大量 import 需要一次改完
export { TTUCourseAPI as NSYSUCourseAPI };
