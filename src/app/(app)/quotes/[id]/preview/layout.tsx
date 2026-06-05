/**
 * 인쇄용 페이지: 부모 (app)/layout 의 사이드바를 우회하기 위해
 * 자체 layout 으로 감싸지만, (app) 그룹의 인증 가드는 그대로 적용된다.
 *
 * 사이드바는 부모 레이아웃의 <main className="ml-[230px]"> 이 적용된 상태이므로
 * 페이지 내부에서 음수 마진과 fixed 트릭으로 화면 전체를 차지하게 만든다.
 */
export default function QuotePreviewLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
