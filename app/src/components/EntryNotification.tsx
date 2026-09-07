import React, { useEffect, useState } from 'react';
import { Modal, Button, Typography, Space } from 'antd';
import { GithubOutlined, StarFilled } from '@ant-design/icons';

const { Paragraph, Text, Link } = Typography;

// 換這個值即可讓所有人再看到一次彈窗
const NOTICE_VERSION = '2026-08';
const STORAGE_KEY = 'TTUCourseSelector.entryNoticeSeen';

const ORIGINAL_REPO = 'https://github.com/nsysu-opendev/NSYSUCourseSelectorV6';
const THIS_REPO = 'https://github.com/shuili1013/ttucs';

const EntryNotification: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== NOTICE_VERSION) {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, []);

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, NOTICE_VERSION);
    } catch {
      /* 忽略無法寫入 localStorage 的情況 */
    }
    setOpen(false);
  };

  return (
    <Modal
      title='歡迎使用大同選課助手 🎓'
      open={open}
      onCancel={close}
      footer={[
        <Button key='close' onClick={close}>
          先看看
        </Button>,
        <Button
          key='star'
          type='primary'
          icon={<StarFilled />}
          href={ORIGINAL_REPO}
          target='_blank'
          rel='noreferrer'
          onClick={close}
        >
          去原專案按個 Star
        </Button>,
      ]}
    >
      <Paragraph>
        這個工具<Text strong>改作自中山大學開源社群</Text>的選課輔助系統
        （NSYSU Course Selector）。如果覺得好用，歡迎到原專案按個 ⭐{' '}
        <Text strong>支持開源</Text>，是對原作者最大的鼓勵！
      </Paragraph>
      <Space direction='vertical' size={4} style={{ width: '100%' }}>
        <Link href={ORIGINAL_REPO} target='_blank' rel='noreferrer'>
          <GithubOutlined /> 原專案 nsysu-opendev/NSYSUCourseSelectorV6
        </Link>
        <Link href={THIS_REPO} target='_blank' rel='noreferrer'>
          <GithubOutlined /> 大同版（本專案）shuili1013/ttucs
        </Link>
      </Space>
    </Modal>
  );
};

export default EntryNotification;
