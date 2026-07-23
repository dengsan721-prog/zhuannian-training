function InformationPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="app-shell">
      <article className="surface onboarding-stack">
        <h1>{title}</h1>
        {children}
        <p><a href="/join">返回入班验证</a></p>
      </article>
    </main>
  );
}

export function PrivacyNoticePage() {
  return (
    <InformationPage title="隐私说明">
      <p>版本：2026-07-22</p>
      <p>Supabase 用于身份验证和数据库，帮助完成手机号验证、同意记录和班级入班。</p>
      <p>我们收集手机号、手机号哈希、同意记录和班级成员关系，用于确认受邀成年人身份、限制验证码滥用并提供班级服务。</p>
      <p>当前尚未配置生产短信供应商或第三方监控服务。</p>
      <p>真实短信能力仍是部署前置条件；启用前会补充实际供应商信息并完成真机验证。</p>
    </InformationPage>
  );
}

export function ServiceBoundaryPage() {
  return (
    <InformationPage title="服务边界">
      <p>本工具仅面向成年人。</p>
      <p>本服务不是急救或危机热线，也不提供诊断或治疗。</p>
      <p>高风险情形应停止转念训练并立即寻求现实帮助，包括暴力、自伤他伤或失联等情况。</p>
    </InformationPage>
  );
}

export function ContentCorrectionPage() {
  return (
    <InformationPage title="内容纠错">
      <p>封闭试用期间，请联系发放班级码的教练反馈内容问题。</p>
      <p>入班后可使用支持入口；正式工单功能尚未上线。</p>
    </InformationPage>
  );
}
