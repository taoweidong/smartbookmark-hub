import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/styles.css';
import App from './App';
import { detectPopupLayout } from './layout';

const container = document.getElementById('root');

async function mount(): Promise<void> {
  // 先判定形态再渲染：弹窗形态保持窄栏，标签页形态铺满宽度
  document.documentElement.dataset.sbhLayout = await detectPopupLayout();
  if (!container) return;
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void mount();
