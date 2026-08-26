import React, { useState } from 'react';
import styled from 'styled-components';
import {
  Button,
  Card,
  Checkbox,
  Flex,
  InputNumber,
  Alert,
  message,
  Modal,
  Popover,
  Space,
  Switch,
  Tag,
  Tooltip,
} from 'antd';
import { CopyOutlined, TagsOutlined } from '@ant-design/icons';

import type { Course } from '@/types';
import type { CourseLabel } from '@/services';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectCourse,
  setHoveredCourseId,
  selectLabels,
  selectCourseLabelMap,
  updateLabel,
  selectSelectedCoursesConfig,
  setCourseConfig,
  selectIsDarkMode,
  selectMyGrade,
} from '@/store';
import { LabelEditDrawer } from '#/Common/Labels';
import LabelEditModal from '#/Common/Labels/LabelEditModal';
import { useTranslation, useWindowSize } from '@/hooks';
import { getLocalizedCourseName, getEligibility } from '@/utils';
import { Color } from 'antd/es/color-picker';
import { CoursesState } from '@/store/slices/coursesSlice';
import type { TranslationKey } from '@/types';

const WEEKDAY_KEYS: TranslationKey[] = [
  'weekdays.mon',
  'weekdays.tue',
  'weekdays.wed',
  'weekdays.thu',
  'weekdays.fri',
  'weekdays.sat',
  'weekdays.sun',
];

const StyledTag = styled(Tag)`
  font-size: 10px;
  padding: 2px 5px;
  white-space: pre-wrap;
  text-align: center;
  margin: 0 auto;
`;

const LabelTag = styled(Tag)`
  font-size: 9px;
  padding: 1px 4px;
  margin: 1px;
  border-radius: 8px;
  line-height: 1.2;
`;

const CourseRow = styled.div<{
  $isHovered?: boolean;
  $isConflict?: boolean;
  $isDark: boolean;
}>`
  font-size: 0.8rem;
  display: flex;
  flex-direction: column;
  padding: 5px;
  border-bottom: 1px solid ${(props) => (props.$isDark ? '#434343' : '#eee')};
  background-color: ${(props) => {
    if (props.$isConflict) return props.$isDark ? '#2a1f1f' : '#fff2f0';
    if (props.$isHovered) return props.$isDark ? '#2a2a2a' : '#f0f0f0';
    return props.$isDark ? '#1f1f1f' : '#fafafa';
  }};
  border-left: ${(props) => (props.$isConflict ? '4px solid #ff4d4f' : 'none')};
  transition: background-color 0.2s ease;
  color: ${(props) => (props.$isDark ? '#fff' : 'inherit')};

  &:hover {
    background-color: ${(props) => {
      if (props.$isConflict) return props.$isDark ? '#3a2525' : '#ffebe8';
      return props.$isDark ? '#2a2a2a' : '#f0f0f0';
    }};
  }
`;

const CourseMainRow = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
`;




const CourseInfo = styled.div`
  flex: 1;
  text-align: center;
  overflow: hidden;
  text-overflow: fade;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;

  &:last-child {
    margin-right: 0;
  }
`;

const MediumCourseInfo = styled(CourseInfo)`
  flex: 0.6;
`;

const SmallCourseInfo = styled(CourseInfo)`
  flex: 0.4;
`;

const TinyCourseInfo = styled(CourseInfo)`
  flex: 0.275;
`;

const StyledLink = styled.a<{ $isDark?: boolean }>`
  display: inline-block;
  text-decoration: none;
  color: ${(props) => (props.$isDark ? '#fff' : 'black')};

  &:hover {
    text-decoration: underline;
  }
`;

const CourseCodeContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  margin-top: 2px;
`;

const CourseCodeText = styled.span<{ $isDark?: boolean }>`
  font-size: 9px;
  color: ${(props) => (props.$isDark ? '#999' : '#666')};
  cursor: pointer;
  padding: 1px 3px;
  border-radius: 2px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: ${(props) => (props.$isDark ? '#333' : '#f0f0f0')};
  }
`;

const CopyIcon = styled(CopyOutlined)<{ $isDark?: boolean }>`
  font-size: 8px;
  color: ${(props) => (props.$isDark ? '#999' : '#666')};
  cursor: pointer;
  padding: 1px;

  &:hover {
    color: ${(props) => (props.$isDark ? '#1890ff' : '#1890ff')};
  }
`;

// 把大同備註（如「AI聯盟；開課學制:大三以上、研究所；課綱:https://reurl.cc/xxx」）
// 格式化成：短標籤做 chip、「標籤:內容」分行加粗、網址變連結（學校網域除外，維持純文字）。
const URL_RE = /(https?:\/\/[^\s；;、]+)/;
const isSchoolUrl = (u: string) => /ttu\.edu\.tw/i.test(u);

const renderInlineValue = (v: string) => {
  const m = v.match(URL_RE);
  if (m && !isSchoolUrl(m[1])) {
    const [before, after] = v.split(m[1]);
    return (
      <>
        {before}
        <a href={m[1]} target='_blank' rel='noreferrer'>
          {m[1]}
        </a>
        {after}
      </>
    );
  }
  return v;
};

const CourseDescription: React.FC<{ text?: string }> = ({ text }) => {
  if (!text || !text.trim()) return null;
  const segments = text
    .split(/[；;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <Space direction='vertical' size={4} style={{ width: '100%' }}>
      {segments.map((seg, i) => {
        const kv = seg.match(/^([^:：]{1,10})[:：]\s*(.+)$/);
        if (kv) {
          return (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.6 }}>
              <b>{kv[1]}</b>：{renderInlineValue(kv[2])}
            </div>
          );
        }
        if (seg.length <= 12 && !URL_RE.test(seg)) {
          return (
            <Tag key={i} color='blue' style={{ margin: 0 }}>
              {seg}
            </Tag>
          );
        }
        return (
          <div key={i} style={{ fontSize: 13, lineHeight: 1.6 }}>
            {renderInlineValue(seg)}
          </div>
        );
      })}
    </Space>
  );
};

const GRADE_LABEL: Record<number, string> = {
  1: '大一',
  2: '大二',
  3: '大三',
  4: '大四',
  10: '研究所',
};
const gradeLabel = (g: number) => GRADE_LABEL[g] || '';

type ItemProps = {
  course: Course;
  isSelected: boolean;
  isConflict: boolean;
  isHovered: boolean;
  displayMode?: 'all' | 'selected';
};

const Item: React.FC<ItemProps> = ({
  course,
  isSelected,
  isConflict,
  isHovered,
  displayMode = 'all',
}) => {
  const { t, i18n } = useTranslation();
  const displayName = getLocalizedCourseName(course.name, i18n.language);
  const dispatch = useAppDispatch();
  const { width } = useWindowSize();
  const isDarkMode = useAppSelector(selectIsDarkMode);
  const myGrade = useAppSelector(selectMyGrade);
  const eligibility = getEligibility(course, myGrade);
  const warnBadge = !eligibility.eligible ? (
    <Tag
      color='error'
      style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', margin: 0 }}
    >
      ⚠{eligibility.reason}
    </Tag>
  ) : null;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelEditModalOpen, setLabelEditModalOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<CourseLabel | undefined>();
  const isMobile = width < 768;

  // 獲取課程配置
  const coursesConfig = useAppSelector<CoursesState['selectedCoursesConfig']>(
    selectSelectedCoursesConfig,
  );
  const config = coursesConfig[course.id] || {
    courseId: course.id,
    points: 0,
    isExported: false,
  };

  // 處理匯出狀態變更
  const handleExportChange = (isExported: boolean) => {
    dispatch(
      setCourseConfig({
        courseId: course.id,
        points: config.points,
        isExported,
      }),
    );
  };

  // 處理點數變更
  const handlePointsChange = (points: number | null) => {
    dispatch(
      setCourseConfig({
        courseId: course.id,
        points: points || 0,
        isExported: config.isExported,
      }),
    );
  };

  const handleSelectCourse = (isSelected: boolean) => {
    dispatch(selectCourse({ course, isSelected }));
  };

  const handleHoverCourse = () => {
    dispatch(setHoveredCourseId(course.id));
  };

  // 複製課程代碼到剪貼簿
  const handleCopyCourseId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(course.id);
      void message.success(
        t('selectedExportMessages.courseIdCopied', { id: course.id }),
      );
    } catch {
      // 備用方案，用於不支援clipboard API的環境
      const textArea = document.createElement('textarea');
      textArea.value = course.id;
      document.body.appendChild(textArea);
      textArea.select();
      void document.execCommand('copy');
      document.body.removeChild(textArea);
      void message.success(
        t('selectedExportMessages.courseIdCopied', { id: course.id }),
      );
    }
  };

  const showModal = () => {
    setIsModalVisible(true);
  };

  const hideModal = () => {
    setIsModalVisible(false);
  };

  const openLabelModal = () => setLabelModalOpen(true);
  const closeLabelModal = () => setLabelModalOpen(false);

  // 處理標籤點擊 - 打開該標籤的編輯介面
  const handleLabelClick = (label: CourseLabel) => {
    setEditingLabel(label);
    setLabelEditModalOpen(true);
  };

  // 處理標籤編輯modal關閉
  const handleLabelEditModalClose = () => {
    setLabelEditModalOpen(false);
    setEditingLabel(undefined);
  };

  // 處理標籤編輯表單提交
  const handleLabelEditSubmit = (
    labelData: Partial<
      CourseLabel & {
        bgColor: Color | string;
        borderColor: Color | string;
        textColor: Color | string;
      }
    >,
  ) => {
    if (editingLabel) {
      // 將顏色物件轉換為字串格式
      const getColorString = (color: Color | string): string => {
        if (typeof color === 'string') {
          return color;
        }
        return color.toHexString();
      };

      const updates = {
        name: labelData.name!,
        bgColor: getColorString(labelData.bgColor!),
        borderColor: getColorString(labelData.borderColor!),
        textColor: getColorString(labelData.textColor!),
      };
      dispatch(updateLabel({ id: editingLabel.id, updates }));
    }
    handleLabelEditModalClose();
  };

  const {
    id,
    classTime,
    department,
    compulsory,
    multipleCompulsory,
    credit,
    english,
    class: classCode,
    grade,
    teacher,
    room,
    hours,
    labHours,
    tags,
    description,
  } = course;

  const getClassCodeColor = (classCode: string | undefined) => {
    switch (classCode) {
      case '不分班':
        return t('course.item.noClass');
      case '全英班':
        return (
          <StyledTag color={'red'}>{t('course.item.englishClass')}</StyledTag>
        );
      case '甲班':
        return <StyledTag color={'blue'}>{t('course.item.classA')}</StyledTag>;
      case '乙班':
        return (
          <StyledTag color={'yellow'}>{t('course.item.classB')}</StyledTag>
        );
      default:
        return classCode;
    }
  };

  const displayClassTime = !classTime.every((time) => time === '') ? (
    classTime.map((time, index) => {
      if (time === '') return false;
      const wrappedTime = time.replace(/(.{3})(?=.)/g, '$1\n');
      return (
        <StyledTag color={'purple'} key={`${id}-${index}`}>
          {`${t(WEEKDAY_KEYS[index])}\n${wrappedTime}`}
        </StyledTag>
      );
    })
  ) : (
    <StyledTag color={'red'}>{t('course.item.unknown')}</StyledTag>
  );

  const displayTeachers = teacher
    ? teacher
        .split(',')
        .filter((t, i, self) => self.indexOf(t) === i)
        .map((t) => {
          const teacherName = t.trim().replace(/'/g, '');
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`大同大學 ${teacherName} DCard | PTT`)}`;

          return (
            <StyledTag color={'purple'} key={t}>
              <StyledLink
                href={searchUrl}
                target={'_blank'}
                rel='noreferrer'
                $isDark={isDarkMode}
              >
                {teacherName}
              </StyledLink>
            </StyledTag>
          );
        })
    : '';

  const labels = useAppSelector(selectLabels);
  const labelMap = useAppSelector(selectCourseLabelMap);
  const courseLabels = labelMap[id] || [];
  const labelTags = courseLabels
    .map((lid) => labels.find((l) => l.id === lid))
    .filter(Boolean)
    .map((label) => (
      <LabelTag
        key={label!.id}
        style={{
          background: label!.bgColor,
          borderColor: label!.borderColor,
          color: label!.textColor,
          cursor: 'pointer',
        }}
        onClick={() => handleLabelClick(label!)}
        title={`點擊編輯標籤「${label!.name}」`}
      >
        {label!.name}
      </LabelTag>
    ));

  const displayTags = tags
    ? tags
        .filter((tag, i, self) => self.indexOf(tag) === i)
        .map((tag) => (
          <StyledTag color={'purple'} key={tag}>
            {tag}
          </StyledTag>
        ))
    : '';

  const content = (
    <Space style={{ maxWidth: 300 }} direction={'vertical'}>
      <Card size='small'>
        <CourseDescription text={description} />
      </Card>

      {displayTags && displayTags.length > 0 && (
        <Card size='small'>
          <Space style={{ width: '100%' }} direction='vertical' size={'small'}>
            <Flex>{displayTags}</Flex>
          </Space>
        </Card>
      )}
    </Space>
  );

  // 站內課程詳細資訊（不連到學校網站）
  const selType = multipleCompulsory ? '多選必修' : compulsory ? '必修' : '選修';
  const creditLine =
    `${credit} 學分` +
    (hours ? `　時數 ${hours}` : '') +
    (labHours && labHours !== '0' ? `　實驗 ${labHours}` : '');

  const detailInfoCard = (
    <Card size='small'>
      <Space
        direction='vertical'
        size={4}
        style={{ width: '100%', fontSize: 13, lineHeight: 1.7 }}
      >
        <div>
          <b>課號　　</b>
          {id}
        </div>
        <div>
          <b>選別　　</b>
          {selType}
        </div>
        <div>
          <b>學分　　</b>
          {creditLine}
        </div>
        <div>
          <b>授課教師</b>　{teacher || '—'}
        </div>
        <div>
          <b>開課系所</b>　{department || '—'}
          {grade ? `　${grade}年級` : ''}
          {classCode ? ` ${classCode}` : ''}
        </div>
        <div>
          <b>時間地點</b>　{room || '未提供'}
        </div>
        {english && (
          <div>
            <b>授課語言</b>　英語
          </div>
        )}
      </Space>
    </Card>
  );

  const detailModal = isModalVisible && (
    <Modal
      title={`${displayName} (${id})`}
      open={isModalVisible}
      onCancel={hideModal}
      footer={null}
      width='90%'
      style={{ maxWidth: 460 }}
    >
      <Space style={{ width: '100%' }} direction='vertical'>
        {!eligibility.eligible && (
          <Alert
            type='error'
            showIcon
            message={`${eligibility.reason}（你目前設定為${gradeLabel(myGrade)}），可能無法選修`}
          />
        )}
        {detailInfoCard}
        {description && (
          <Card size='small'>
            <CourseDescription text={description} />
          </Card>
        )}
        {displayTags && displayTags.length > 0 && (
          <Card size='small'>
            <Flex>{displayTags}</Flex>
          </Card>
        )}
      </Space>
    </Modal>
  );

  return (
    <CourseRow
      $isHovered={isHovered}
      $isConflict={isConflict}
      $isDark={isDarkMode}
      onMouseEnter={handleHoverCourse}
      onMouseLeave={() => dispatch(setHoveredCourseId(''))}
    >
      <CourseMainRow>
        {displayMode === 'all' ? (
          <>
            <TinyCourseInfo>
              <Checkbox
                name={id}
                checked={isSelected}
                onChange={(e) => handleSelectCourse(e.target.checked)}
              />
            </TinyCourseInfo>
          </>
        ) : (
          <>
            <SmallCourseInfo>
              <Switch
                checked={config.isExported}
                onChange={handleExportChange}
                size='small'
              />
            </SmallCourseInfo>
            <SmallCourseInfo>
              <InputNumber
                min={0}
                max={100}
                value={config.points}
                onChange={handlePointsChange}
                size='small'
                style={{ width: '60px' }}
              />
            </SmallCourseInfo>
          </>
        )}
        <CourseInfo>
          {isMobile ? (
            <>
              <div style={{ textAlign: 'center' }}>
                <StyledLink
                  href='#'
                  onClick={(e) => {
                    e.preventDefault();
                    showModal();
                  }}
                  $isDark={isDarkMode}
                >
                  {displayName}
                </StyledLink>
                <CourseCodeContainer>
                  <CourseCodeText
                    $isDark={isDarkMode}
                    onClick={handleCopyCourseId}
                    title={t('course.item.clickToCopyCourseId')}
                  >
                    {id}
                  </CourseCodeText>
                  <CopyIcon
                    $isDark={isDarkMode}
                    onClick={handleCopyCourseId}
                    title={t('course.item.copyCourseId')}
                  />
                </CourseCodeContainer>
                {warnBadge}
              </div>
              {detailModal}
            </>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <Popover
                content={content}
                title={
                  <>
                    {displayName} ({id})
                  </>
                }
                trigger={['hover', 'focus']}
                placement={'right'}
              >
                <StyledLink
                  href='#'
                  onClick={(e) => {
                    e.preventDefault();
                    showModal();
                  }}
                  $isDark={isDarkMode}
                >
                  {displayName}
                </StyledLink>
              </Popover>
              {detailModal}
              <CourseCodeContainer>
                <CourseCodeText
                  $isDark={isDarkMode}
                  onClick={handleCopyCourseId}
                  title={t('course.item.clickToCopyCourseId')}
                >
                  {id}
                </CourseCodeText>
                <CopyIcon
                  $isDark={isDarkMode}
                  onClick={handleCopyCourseId}
                  title={t('course.item.copyCourseId')}
                />
              </CourseCodeContainer>
              {warnBadge}
            </div>
          )}
        </CourseInfo>
        {displayMode === 'all' && (
          <>
            <MediumCourseInfo>
              <Space direction={'vertical'}>{displayClassTime}</Space>
            </MediumCourseInfo>
          </>
        )}
        <SmallCourseInfo>{department}</SmallCourseInfo>
        {displayMode === 'all' && (
          <>
            <SmallCourseInfo>
              {compulsory ? (
                <StyledTag color={'red'}>{t('course.item.required')}</StyledTag>
              ) : (
                <span>{t('course.item.elective')}</span>
              )}
            </SmallCourseInfo>
          </>
        )}
        <SmallCourseInfo>
          <StyledTag
            color={
              ['yellow', 'green', 'blue', 'purple'][parseInt(credit) - 1] ||
              'red'
            }
          >
            {credit}
          </StyledTag>
        </SmallCourseInfo>
        <SmallCourseInfo>
          {english ? (
            <StyledTag color={'red'}>{t('course.item.english')}</StyledTag>
          ) : (
            t('course.item.chinese')
          )}
        </SmallCourseInfo>
        {displayMode === 'all' && (
          <SmallCourseInfo>
            <Flex align={'center'} justify={'center'} vertical={true}>
              {getClassCodeColor(classCode)}
              <span>{'⓪①②③④'[parseInt(grade)]}</span>
            </Flex>
          </SmallCourseInfo>
        )}
        <SmallCourseInfo>
          <Flex align={'center'} justify={'center'} vertical={true} gap={5}>
            {displayTeachers}
          </Flex>
        </SmallCourseInfo>
        {displayMode === 'all' && (
          <CourseInfo>
            <Flex align={'center'} justify={'center'} vertical={true} gap={5}>
              {displayTags}
            </Flex>
          </CourseInfo>
        )}
      </CourseMainRow>
      {/* 機率條上方區域 - 整合資訊與標籤 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          minHeight: '18px',
        }}
      >
        {/* 左側：留空（已移除人數/選上機率顯示） */}
        <div />

        {/* 右側：標籤與編輯按鈕 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {labelTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {labelTags}
            </div>
          )}
          <Button
            icon={
              <Tooltip title={t('course.item.editLabels')} placement={'left'}>
                <TagsOutlined />
              </Tooltip>
            }
            type='text'
            size='small'
            onClick={openLabelModal}
            style={{
              padding: '2px 4px',
              height: 'auto',
              minWidth: 'auto',
              opacity: 0.6,
              color: isDarkMode ? '#999' : '#666',
            }}
            title={t('course.item.editLabels')}
          />
        </div>
      </div>
      {labelModalOpen && (
        <LabelEditDrawer
          courseId={id}
          open={labelModalOpen}
          onClose={closeLabelModal}
        />
      )}
      {labelEditModalOpen && (
        <LabelEditModal
          open={labelEditModalOpen}
          label={editingLabel}
          mode='edit'
          onCancel={handleLabelEditModalClose}
          onSubmit={handleLabelEditSubmit}
        />
      )}
    </CourseRow>
  );
};

export default React.memo(Item);
