import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  Card,
  Button,
  Space,
  message,
  Modal,
  Input,
  Typography,
  Flex,
  Tag,
  Empty,
} from 'antd';
import {
  ExportOutlined,
  ImportOutlined,
  CopyOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import styled from 'styled-components';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneLight } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';

import { useTranslation } from '@/hooks';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  selectSelectedCourses,
  selectSelectedCoursesConfig,
  selectHoveredCourseId,
  setCourseConfig,
  importCoursesFromScript,
  selectIsDarkMode,
} from '@/store';
import type { Course, ExportCourseData, SelectedCourseConfig } from '@/types';
import SelectedExportHeader from '#/SelectorPanel/SelectedExport/Header';
import SelectedExportItem from '#/Common/CoursesList/Item';
import HelpModal from '#/SelectorPanel/SelectedExport/HelpModal';

const { TextArea } = Input;
const { Text, Title } = Typography;

const StyledCard = styled(Card)`
  div.ant-card-head {
    padding: 0;
  }

  div.ant-card-head-title {
    padding: 8px 12px;
  }

  div.ant-card-body {
    padding: 0;
  }
`;


interface CourseDataWithConfig {
  course: Course;
  points: number;
  isExported: boolean;
}

const SelectedExport: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const selectedCourses = useAppSelector(selectSelectedCourses);
  const coursesConfig = useAppSelector(selectSelectedCoursesConfig);
  const hoveredCourseId = useAppSelector(selectHoveredCourseId);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isDark = useAppSelector(selectIsDarkMode);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [scriptModalVisible, setScriptModalVisible] = useState(false);
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [importScript, setImportScript] = useState('');
  const [generatedScript, setGeneratedScript] = useState('');

  // 依大同快速選課上限(5)把課號切成多批
  const codeBatches = useMemo(() => {
    const codes = generatedScript.split('\n').filter(Boolean);
    const batches: string[][] = [];
    for (let i = 0; i < codes.length; i += 5) {
      batches.push(codes.slice(i, i + 5));
    }
    return batches;
  }, [generatedScript]);

  // 準備課程數據，包含配置信息
  const courseData = useMemo((): CourseDataWithConfig[] => {
    return selectedCourses.map((course) => {
      const config = coursesConfig[course.id] || {
        courseId: course.id,
        points: 0,
        isExported: false,
      };
      return {
        course,
        points: config.points,
        isExported: config.isExported,
      };
    });
  }, [selectedCourses, coursesConfig]);

  // 全選/全不選匯出
  const handleSelectAll = useCallback(
    (selected: boolean) => {
      selectedCourses.forEach((course) => {
        const config = coursesConfig[course.id] || {
          courseId: course.id,
          points: 0,
          isExported: false,
        };
        dispatch(
          setCourseConfig({
            courseId: course.id,
            points: config.points,
            isExported: selected,
          }),
        );
      });
    },
    [selectedCourses, coursesConfig, dispatch],
  );

  // 生成匯出腳本
  const generateExportScript = useCallback(() => {
    const codes = courseData
      .filter((item) => item.isExported)
      .map((item) => item.course.id);

    if (codes.length === 0) {
      void messageApi.warning(t('selectedExportMessages.selectAtLeastOne'));
      return;
    }

    // 大同快速選課文字框：一行一個課號，直接貼上即可。
    // 這裡輸出純課號清單（不含註解，方便整段複製）。
    setGeneratedScript(codes.join('\n'));
    setScriptModalVisible(true);
  }, [courseData, messageApi, t]);

  // 複製單一批課號到剪貼簿
  const copyBatch = useCallback(
    async (batch: string[], idx: number) => {
      try {
        await navigator.clipboard.writeText(batch.join('\n'));
        void messageApi.success(`已複製第 ${idx + 1} 批（${batch.length} 門）`);
      } catch {
        void messageApi.error(t('selectedExportMessages.copyFailed'));
      }
    },
    [messageApi, t],
  );

  // 匯入腳本
  const handleImportScript = useCallback(() => {
    try {
      let courseIds: string[] = [];

      // 相容舊版中山格式：const exportClass = [ {id,value,isSel}, ... ];
      const legacy = importScript.match(/const exportClass = (\[[\s\S]*?]);/);
      if (legacy) {
        const exportData: ExportCourseData[] = JSON.parse(legacy[1]);
        courseIds = exportData.map((item) => item.id);
      } else {
        // 大同格式：一行一個課號（忽略空白行與 # 註解）
        courseIds = importScript
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'));
      }

      if (courseIds.length === 0) {
        void messageApi.error(t('selectedExport.importError'));
        return;
      }

      const configs: Record<string, SelectedCourseConfig> = {};
      courseIds.forEach((id) => {
        configs[id] = { courseId: id, points: 0, isExported: true };
      });

      dispatch(importCoursesFromScript({ courseIds, configs }));
      void messageApi.success(t('selectedExport.importSuccess'));
      setImportModalVisible(false);
      setImportScript('');
    } catch {
      void messageApi.error(t('selectedExport.importError'));
    }
  }, [importScript, dispatch, messageApi, t]);

  // 統計已選匯出的課程數量
  const exportedCount = useMemo(() => {
    return courseData.filter((item) => item.isExported).length;
  }, [courseData]);
  // 虛擬列表渲染項目
  const renderItem = (index: number) => {
    if (index === 0) {
      return <SelectedExportHeader />;
    }

    const item = courseData[index - 1];
    if (!item) return null;

    const isHovered = hoveredCourseId === item.course.id;

    return (
      <SelectedExportItem
        key={item.course.id}
        course={item.course}
        isHovered={isHovered}
        isSelected={false}
        isConflict={false}
        displayMode={'selected'}
      />
    );
  };
  const CardTitle = (
    <Flex justify='space-between' align='center' wrap={true} gap={'10px'}>
      <Space>
        <Title level={5} style={{ margin: 0 }}>
          {t('selectedExport.title')}
        </Title>
        <Button
          icon={<QuestionCircleOutlined />}
          onClick={() => setHelpModalVisible(true)}
          size='small'
          type='text'
        >
          {t('selectedExport.helpButton')}
        </Button>
      </Space>
      <Space>
        <Button
          icon={<ImportOutlined />}
          onClick={() => setImportModalVisible(true)}
          size='small'
        >
          {t('selectedExport.importButton')}
        </Button>
        <Button
          type='primary'
          icon={<ExportOutlined />}
          onClick={generateExportScript}
          disabled={selectedCourses.length === 0}
          size='small'
        >
          {t('selectedExport.exportButton')}
        </Button>
      </Space>
    </Flex>
  );
  if (selectedCourses.length === 0) {
    return (
      <>
        <StyledCard title={CardTitle}>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('selectedExport.noSelectedCourses')}
            />
          </div>
        </StyledCard>

        {/* 使用說明對話框 */}
        <HelpModal
          open={helpModalVisible}
          onClose={() => setHelpModalVisible(false)}
        />

        {/* 匯入腳本對話框 */}
        <Modal
          title={t('selectedExport.importButton')}
          open={importModalVisible}
          onOk={handleImportScript}
          onCancel={() => {
            setImportModalVisible(false);
            setImportScript('');
          }}
          width={600}
        >
          <TextArea
            value={importScript}
            onChange={(e) => setImportScript(e.target.value)}
            placeholder={t('selectedExport.importPlaceholder')}
            rows={10}
            style={{ fontFamily: 'monospace' }}
          />
        </Modal>
      </>
    );
  }

  const dataWithHeader = [null, ...courseData];

  return (
    <>
      {contextHolder}
      <StyledCard title={CardTitle}>
        {/* 操作區域 */}
        <div style={{ padding: '12px', borderBottom: '1px solid #f0f0f0' }}>
          <Space direction='vertical' style={{ width: '100%' }} size='small'>
            <Text type='secondary' style={{ fontSize: '14px' }}>
              {t('selectedExport.exportDescription')}
            </Text>

            <Flex justify='space-between' align='center'>
              <Space>
                <Button size='small' onClick={() => handleSelectAll(true)}>
                  {t('selectedExport.selectAll')}
                </Button>
                <Button size='small' onClick={() => handleSelectAll(false)}>
                  {t('selectedExport.selectNone')}
                </Button>
              </Space>

              <Tag color='blue'>
                {t('selectedExport.totalExported', { count: exportedCount })}
              </Tag>
            </Flex>
          </Space>
        </div>
        {/* 課程列表 */}
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: 'calc(100vh - 210px)' }}
          data={dataWithHeader}
          itemContent={renderItem}
          topItemCount={1}
        />
      </StyledCard>

      {/* 使用說明對話框 */}
      <HelpModal
        open={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
      />

      {/* 匯入腳本對話框 */}
      <Modal
        title={t('selectedExport.importButton')}
        open={importModalVisible}
        onOk={handleImportScript}
        onCancel={() => {
          setImportModalVisible(false);
          setImportScript('');
        }}
        width={600}
      >
        <TextArea
          value={importScript}
          onChange={(e) => setImportScript(e.target.value)}
          placeholder={t('selectedExport.importPlaceholder')}
          rows={10}
          style={{ fontFamily: 'monospace' }}
        />
      </Modal>

      {/* 匯出腳本對話框 */}
      <Modal
        title={t('selectedExport.exportButton')}
        open={scriptModalVisible}
        onCancel={() => setScriptModalVisible(false)}
        width={800}
        footer={[
          <Button key='close' onClick={() => setScriptModalVisible(false)}>
            {t('common.close')}
          </Button>,
        ]}
      >
        <Text>
          大同「快速選課」每次上限 5 筆，已幫你每 5 個分成一批。逐批按「複製這批」→
          貼進大同快速選課文字框 → 送出。
        </Text>
        <Space
          direction='vertical'
          size={16}
          style={{ width: '100%', marginTop: 12 }}
        >
          {codeBatches.map((batch, idx) => (
            <div key={idx}>
              <Flex justify='space-between' align='center' style={{ marginBottom: 6 }}>
                <Text strong>
                  第 {idx + 1} 批（{batch.length} 門）
                </Text>
                <Button
                  size='small'
                  type='primary'
                  icon={<CopyOutlined />}
                  onClick={() => copyBatch(batch, idx)}
                >
                  複製這批
                </Button>
              </Flex>
              <SyntaxHighlighter
                language='text'
                style={isDark ? atomOneDark : atomOneLight}
                customStyle={{ borderRadius: '4px', margin: 0 }}
              >
                {batch.join('\n')}
              </SyntaxHighlighter>
            </div>
          ))}
        </Space>
      </Modal>
    </>
  );
};

export default SelectedExport;
