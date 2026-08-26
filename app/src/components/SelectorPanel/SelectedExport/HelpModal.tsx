import React from 'react';
import { Modal, Button, Typography, Steps, Alert } from 'antd';
import styled from 'styled-components';

import { useAppSelector } from '@/store/hooks';
import { selectIsDarkMode } from '@/store';

const { Text, Title, Paragraph } = Typography;

const StyledModal = styled(Modal)<{ $isDark: boolean }>`
  .ant-modal-content,
  .ant-modal-header,
  .ant-modal-footer {
    background-color: ${(props) => (props.$isDark ? '#1f1f1f' : '#ffffff')};
  }
`;

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ open, onClose }) => {
  const isDark = useAppSelector(selectIsDarkMode);

  return (
    <StyledModal
      $isDark={isDark}
      title='匯出使用說明'
      open={open}
      onCancel={onClose}
      footer={[
        <Button key='close' type='primary' onClick={onClose}>
          我知道了
        </Button>,
      ]}
    >
      <Title level={5}>如何把排好的課匯出到大同選課系統</Title>
      <Steps
        direction='vertical'
        size='small'
        current={-1}
        style={{ marginTop: 16 }}
        items={[
          {
            title: '在課程列表勾選要選的課',
            description: '勾好之後按右上角的「匯出」按鈕。',
          },
          {
            title: '逐批複製課號',
            description:
              '系統會把課號每 5 個分成一批，每批一個「複製這批」按鈕，按下即複製那 5 個課號。',
          },
          {
            title: '貼進大同「快速選課」',
            description:
              '登入大同選課系統(cousel.ttu.edu.tw) → 進入「快速選課」→ 把課號貼進文字框（一行一個）→ 按送出。',
          },
          {
            title: '重複下一批',
            description: '回到本工具複製第 2 批、第 3 批…，逐批貼上送出即可。',
          },
        ]}
      />
      <Alert
        style={{ marginTop: 16 }}
        type='warning'
        showIcon
        message='注意事項'
        description={
          <Paragraph style={{ margin: 0 }}>
            <Text>• 大同快速選課每次上限 5 筆，所以要分批貼上。</Text>
            <br />
            <Text>• 選課紀錄超過 50 筆後無法使用快速選課功能。</Text>
            <br />
            <Text>• 實際選課結果請以大同官方選課系統為準。</Text>
          </Paragraph>
        }
      />
    </StyledModal>
  );
};

export default HelpModal;
