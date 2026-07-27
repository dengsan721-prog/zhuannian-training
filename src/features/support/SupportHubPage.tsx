import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export function SupportHubPage() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="app-shell">
      <section className="surface support-shell">
        <p className="eyebrow">由你决定是否提交</p>
        <h1 ref={headingRef} tabIndex={-1}>支持与安全</h1>
        <p>
          普通求助和安全报告是两条独立流程。
          提交普通求助不会自动创建安全报告，查看安全报告选项也不会自动提交。
        </p>
        <nav className="support-actions" aria-label="支持入口">
          <Link className="primary-action" to="/support/request">
            请求教练帮助
          </Link>
          <Link className="secondary-action" to="/support/safety-report">
            创建安全报告
          </Link>
          <Link className="secondary-action" to="/support/status">
            查看提交状态
          </Link>
        </nav>
      </section>
    </main>
  );
}
