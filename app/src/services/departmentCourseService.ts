import type { Course } from '@/types';

/**
 * 系所課程篩選服務
 * 專門處理系所、年級、班別、必修/選修等篩選邏輯
 */
export class DepartmentCourseService {
  /**
   * 從課程列表中提取所有唯一的系所
   * @param courses 課程列表
   * @returns 系所選項列表
   */
  static extractDepartments(courses: Course[]): string[] {
    const departments = new Set<string>();
    courses.forEach((course) => {
      if (course.department?.trim()) {
        departments.add(course.department.trim());
      }
      course.classMemberships?.forEach((m) => {
        if (m.department?.trim()) departments.add(m.department.trim());
      });
    });
    return Array.from(departments).sort();
  }

  /**
   * 從課程列表中提取所有唯一的年級
   * @param courses 課程列表
   * @returns 年級選項列表
   */
  static extractGrades(courses: Course[]): string[] {
    const grades = new Set<string>();
    courses.forEach((course) => {
      if (course.grade?.trim()) {
        grades.add(course.grade.trim());
      }
      course.classMemberships?.forEach((m) => {
        if (m.grade?.trim()) grades.add(m.grade.trim());
      });
    });
    return Array.from(grades).sort();
  }

  /**
   * 從課程列表中提取所有唯一的班別
   * @param courses 課程列表
   * @returns 班別選項列表
   */
  static extractClasses(courses: Course[]): string[] {
    const classes = new Set<string>();
    courses.forEach((course) => {
      if (course.class?.trim()) {
        classes.add(course.class.trim());
      }
      course.classMemberships?.forEach((m) => {
        if (m.class?.trim()) classes.add(m.class.trim());
      });
    });
    return Array.from(classes).sort();
  }

  /**
   * 取得必修/選修類型選項
   * @returns 必修/選修類型選項列表
   */
  static getCompulsoryTypeOptions(): Array<{
    label: string;
    value: string;
  }> {
    return [
      { label: '必修課程', value: 'compulsory' },
      { label: '選修課程', value: 'elective' },
      { label: '多選必修', value: 'multipleCompulsory' },
    ];
  }

  /**
   * 根據篩選條件過濾課程
   * @param courses 原始課程列表
   * @param filters 篩選條件
   * @returns 篩選後的課程列表
   */
  static filterCourses(
    courses: Course[],
    filters: {
      selectedDepartments: string[];
      selectedGrades: string[];
      selectedClasses: string[];
      selectedCompulsoryTypes: string[];
    },
  ): Course[] {
    const {
      selectedDepartments,
      selectedGrades,
      selectedClasses,
      selectedCompulsoryTypes,
    } = filters;

    if (
      selectedDepartments.length === 0 &&
      selectedGrades.length === 0 &&
      selectedClasses.length === 0 &&
      selectedCompulsoryTypes.length === 0
    ) {
      return courses;
    }

    return courses.filter((course) => {
      // 一門課可能屬於多個班級；只要有「同一個班級」同時符合所有條件即可（避免跨班誤配）
      const memberships =
        course.classMemberships && course.classMemberships.length > 0
          ? course.classMemberships
          : [
              {
                department: course.department,
                grade: course.grade,
                class: course.class || '',
                compulsory: course.compulsory,
                multipleCompulsory: course.multipleCompulsory,
              },
            ];

      return memberships.some((m) => {
        if (
          selectedDepartments.length > 0 &&
          !selectedDepartments.includes(m.department)
        ) {
          return false;
        }
        if (selectedGrades.length > 0 && !selectedGrades.includes(m.grade)) {
          return false;
        }
        if (
          selectedClasses.length > 0 &&
          !selectedClasses.includes(m.class || '')
        ) {
          return false;
        }
        if (selectedCompulsoryTypes.length > 0) {
          const types: string[] = [m.compulsory ? 'compulsory' : 'elective'];
          if (m.multipleCompulsory) types.push('multipleCompulsory');
          if (!types.some((t) => selectedCompulsoryTypes.includes(t))) {
            return false;
          }
        }
        return true;
      });
    });
  }
  /**
   * 從 localStorage 載入篩選條件
   * @returns 儲存的篩選條件或預設值
   */
  static loadFiltersFromStorage(): {
    selectedDepartments: string[];
    selectedGrades: string[];
    selectedClasses: string[];
    selectedCompulsoryTypes: string[];
  } {
    try {
      const stored = localStorage.getItem(
        'NSYSUCourseSelector.departmentCoursesFilters',
      );
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          selectedDepartments: parsed.selectedDepartments || [],
          selectedGrades: parsed.selectedGrades || [],
          selectedClasses: parsed.selectedClasses || [],
          selectedCompulsoryTypes: parsed.selectedCompulsoryTypes || [],
        };
      }
    } catch (error) {
      console.warn('無法載入系所課程篩選條件:', error);
    }

    return {
      selectedDepartments: [],
      selectedGrades: [],
      selectedClasses: [],
      selectedCompulsoryTypes: [],
    };
  }
  /**
   * 將篩選條件儲存到 localStorage
   * @param filters 要儲存的篩選條件
   */
  static saveFiltersToStorage(filters: {
    selectedDepartments: string[];
    selectedGrades: string[];
    selectedClasses: string[];
    selectedCompulsoryTypes: string[];
  }): void {
    try {
      localStorage.setItem(
        'NSYSUCourseSelector.departmentCoursesFilters',
        JSON.stringify(filters),
      );
    } catch (error) {
      console.warn('無法儲存系所課程篩選條件:', error);
    }
  }
}
