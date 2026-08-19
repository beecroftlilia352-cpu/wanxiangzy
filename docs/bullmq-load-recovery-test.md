# BullMQ 队列压测与故障恢复验收

该工具直接使用项目锁定版本的 BullMQ 和标准 Redis，验证多 Worker 吞吐、并发边界、重复投递去重、延迟调度、失败重试以及结束后的队列泄漏。

## 安全边界

脚本不会读取 `REDIS_URL` 作为默认值。运行时必须同时满足：

- 显式设置 `LOAD_TEST_REDIS_URL`，并指向专用的本地、开发或测试 Redis。
- 显式设置 `ALLOW_QUEUE_LOAD_TEST=1`。
- `LOAD_TEST_REDIS_URL` 不能与应用的 `REDIS_URL` 相同。
- host 不能包含 `prod`、`production`、`live`、`primary` 或 `master` 等生产标记。
- `NODE_ENV`、`VERCEL_ENV`、`DEPLOYMENT_ENV`、`APP_ENV` 均不能是 `production`。

每次运行都会生成不可预测的随机 BullMQ prefix 和 queue 名。结束时只调用该随机测试 queue 的 `obliterate`，不会执行 Redis `SCAN`、`FLUSHDB`、`FLUSHALL`，也不会删除用户提供的 key pattern。

建议使用空白、可丢弃的 Redis 实例。不要用生产 Redis 验证此脚本。

## 运行

```bash
ALLOW_QUEUE_LOAD_TEST=1 \
LOAD_TEST_REDIS_URL=redis://127.0.0.1:6379/15 \
npm run queue:load-test -- \
  --jobs 10000 \
  --workers 8 \
  --concurrency 32 \
  --work-ms 20 \
  --delay-ms 1000 \
  --failure-jobs 100 \
  --timeout-ms 300000
```

主要参数也可以通过环境变量配置：

| CLI | 环境变量 | 默认值 |
| --- | --- | ---: |
| `--jobs` | `LOAD_TEST_JOBS` | 500 |
| `--workers` | `LOAD_TEST_WORKERS` | 4 |
| `--concurrency` | `LOAD_TEST_CONCURRENCY` | 8 |
| `--work-ms` | `LOAD_TEST_WORK_MS` | 20 |
| `--delay-ms` | `LOAD_TEST_DELAY_MS` | 750 |
| `--retry-delay-ms` | `LOAD_TEST_RETRY_DELAY_MS` | 50 |
| `--failure-jobs` | `LOAD_TEST_FAILURE_JOBS` | 10 |
| `--timeout-ms` | `LOAD_TEST_TIMEOUT_MS` | 120000 |

## 通过条件与输出

脚本只有在以下条件全部满足时才以状态码 0 结束：

- 峰值 processor 并发不超过 `workers × concurrency`。
- 每个 logical job 恰好成功完成一次。
- 重复提交同一个 BullMQ `jobId` 只执行一次。
- 延迟任务没有提前执行。
- 指定的首轮失败任务全部发生重试并最终成功。
- 结束时 `waiting=0`、`active=0`、`delayed=0`、终态失败数为 0。

成功输出为 JSON，包含总耗时、jobs/s 吞吐、端到端延迟 p50/p95/p99、峰值并发、瞬时失败数、终态失败数和泄漏计数。输出只包含随机 queue/prefix，不打印 Redis URL、host 或凭据。
