import { Card, Col, Row, Skeleton, Space } from "antd";

export default function AdminLoading() {
  return (
    <Space direction="vertical" size={16} className="w-full">
      <div className="admin-page-hero">
        <div className="min-w-0">
          <Skeleton active paragraph={{ rows: 2, width: ["60%", "100%"] }} title={{ width: 96 }} />
        </div>
        <div className="hidden h-9 w-32 rounded-lg bg-slate-100 sm:block" />
      </div>

      <Row gutter={[12, 12]}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Col xs={24} sm={12} xl={4} key={index}>
            <Card>
              <Skeleton active paragraph={{ rows: 1 }} title={{ width: "48%" }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title={<span className="block h-4 w-28 rounded bg-slate-100" />}>
            <div className="h-[300px] rounded-lg bg-slate-100" />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title={<span className="block h-4 w-28 rounded bg-slate-100" />}>
            <div className="h-[300px] rounded-lg bg-slate-100" />
          </Card>
        </Col>
      </Row>

      <Card title={<span className="block h-4 w-28 rounded bg-slate-100" />}>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    </Space>
  );
}
