---
title: 关于 RAG 的学习③：补完 Step Back、HyDE 和 Routing
date: 2026-06-26 16:05:39
categories:
  - 学习成长
tags:
  - RAG
  - 大模型
  - Query Translation
  - Step Back
  - HyDE
  - Routing
---

这篇是我学习 RAG 的第三篇自学笔记。

上一篇主要是在 Query Translation 阶段实现了三个能力：

```text
Multi Query
  -> 从多个角度改写原始问题

RAG Fusion
  -> 用 RRF 融合多路检索结果

Decomposition
  -> 把复杂问题拆成多个子问题
```

这一篇继续补完 Query Translation 里剩下的几个方向：

```text
Step Back
  -> 从具体问题生成更高层次、更抽象的问题

HyDE
  -> 根据问题生成假设性回答文档，再用假设文档向量检索真实文档

Routing
  -> 通过意图识别判断当前 query 应该走哪一条查询优化路线
```

对应的学习仓库仍然是：

[RAG_Std](https://github.com/lzstack879/RAG_Std)

<!-- more -->

这次修改以后，我对 RAG 的理解又往前走了一步：Query Translation 不只是“把问题改写一下”，它更像是一个检索前的决策层。

当系统里只有一种优化策略时，只要手动开关就可以。但当 Multi Query、Decomposition、Step Back、HyDE 都存在以后，真正重要的问题会变成：

```text
当前这个问题，到底适合哪一种 query 处理方式？
```

所以这篇会分成两部分：

- 先整理 Step Back 和 HyDE 的实现。
- 再整理 Routing 如何把这些策略统一起来。

# 1. 当前 Query Translation 的位置

现在项目已经按 RAG 的基本流程重新整理了目录：

```text
src/rag_std/
  indexing/
    splitter.py
    embedding.py
    vector_store.py

  retrieval/
    query_translation.py
    routing.py
    fusion.py
    retriever.py
    reranker.py

  generation/
    generator.py

  pipeline.py
  cli.py
```

这次新增的 Step Back、HyDE、Routing 都放在 Retrieval 阶段。

原因也比较自然：它们都发生在真正生成答案之前，而且都直接影响“用什么 query 去检索文档”。

当前 Retrieval 阶段大致是：

```text
用户问题
  -> Routing 判断路线
  -> Query Translation 生成新的 query 或假设文档
  -> Retriever 执行检索
  -> RRF 融合多路检索结果
  -> ReRank 精排
```

其中：

- `query_translation.py`：负责生成 Multi Query、子问题、Step Back 问题、HyDE 假设文档
- `routing.py`：负责判断当前问题应该使用哪条路线
- `retriever.py`：负责把不同路线真正接入向量检索
- `fusion.py`：负责用 RRF 融合多路结果
- `pipeline.py`：负责把路线选择和检索流程串起来
- `cli.py`：负责暴露命令行参数，方便测试

# 2. 为什么还需要 Step Back

上一篇已经实现了 Multi Query 和 Decomposition。

Multi Query 解决的是：

```text
同一个问题，可以有多种说法。
```

Decomposition 解决的是：

```text
一个复杂问题，可以拆成多个子问题。
```

但还有一种情况，它既不是简单的同义改写，也不是单纯拆子问题。

比如：

```text
张三这次数学考了多少分？
```

这个问题表面上是在问一个具体分数。但如果知识库里没有直接写分数，而是写了张三最近的学习状态、课堂表现、作业完成情况，那么直接检索“数学考了多少分”可能找不到足够好的片段。

这时可以退一步问：

```text
如何评价张三这段时间的学习表现？
```

这个更抽象的问题，可能更容易检索到背景信息。

这就是 Step Back 的直觉：

```text
从具体问题退一步，生成一个更高层次的问题。
```

它不是要替代原始问题，而是要补充原始问题。

所以我在实现时采用的是：

```text
原始 query
  + Step Back query
  -> 分别检索
  -> RRF 融合
```

# 3. Step Back 的代码实现

Step Back 的生成逻辑放在：

```text
src/rag_std/retrieval/query_translation.py
```

里面仍然使用 `QueryRewriter` 这个类。

虽然文件已经重命名为 `query_translation.py`，但是类名暂时还保留 `QueryRewriter`，因为它承担的是“查询变换”这个职责，后面如果继续整理，可以再改成 `QueryTranslator`。

Step Back 主要有三个方法：

```python
def build_step_back_prompt(self, query: str, num_questions: int) -> str:
    ...

def step_back(self, query: str, num_questions: int = 1) -> List[str]:
    ...

def step_back_with_original(self, query: str, num_questions: int = 1) -> List[str]:
    ...
```

`build_step_back_prompt(...)` 负责构造 prompt。

我在 prompt 里强调了几件事：

- 不直接回答原问题
- 不只是同义改写原问题
- 从具体事实、具体对象或具体事件，上升到背景、评价、原因、机制或原则
- 生成的问题要有助于检索到更全面的相关文档
- 只返回 JSON 字符串数组

其中 few-shot 示例很关键。

例如：

```text
具体问题：张三这次数学考了多少分？
Step Back 问题：如何评价张三这段时间的学习表现？

具体问题：皮卡丘为什么能击败火神？
Step Back 问题：这场战斗体现了皮卡丘和小智怎样的战斗能力与配合？

具体问题：某个接口为什么返回 401？
Step Back 问题：这个系统的身份认证流程有哪些关键约束和常见失败点？
```

这些例子其实是在告诉模型：不要只换个说法，而是要把问题抽象一层。

`step_back(...)` 负责真正调用大模型生成 Step Back 问题。

大致流程是：

```text
原始 query
  -> 去除首尾空格
  -> 如果 query 为空或数量 <= 0，返回空列表
  -> 调用 DashScope Generation
  -> 解析模型返回的 JSON 数组
  -> 去重
  -> 返回指定数量的问题
```

`step_back_with_original(...)` 负责把原始问题也放进最终 query 列表。

这是我觉得比较重要的一点。

如果只用 Step Back 问题检索，可能会丢掉原始问题里的具体实体和细节。如果只用原始问题检索，又可能找不到背景信息。

所以更稳的方式是：

```text
[
  原始问题,
  Step Back 问题
]
```

再把它们都交给检索器。

# 4. Step Back 如何接入检索

Step Back 的检索入口放在：

```text
src/rag_std/retrieval/retriever.py
```

对应方法是：

```python
def retrieve_step_back(
    self,
    query: str,
    top_k: int = 5,
    step_back_count: int = 1,
    rrf_k: int = 60,
) -> List[RetrievedChunk]:
    ...
```

它的逻辑是：

```text
如果没有 query_rewriter，或者 step_back_count <= 0：
  -> 回退到普通 retrieve

否则：
  -> 生成 [原始 query, Step Back query]
  -> 每个 query 分别检索
  -> 用 RRF 融合结果
  -> 返回 top_k
```

流程可以写成：

```text
query
  -> step_back_with_original
  -> [
       query,
       step_back_query
     ]
  -> 分别向量化检索
  -> reciprocal_rank_fusion_chunks
  -> 得到融合后的候选片段
```

这里继续使用 RRF，是因为 Step Back 本质上也会产生多路检索结果。

一个片段如果既能被原始问题召回，又能被抽象问题召回，说明它既包含具体信息，也包含背景信息，排名应该更靠前。

# 5. 为什么还需要 HyDE

HyDE 的全称是：

```text
Hypothetical Document Embeddings
```

直译就是“假设性文档嵌入”。

它和 Multi Query、Decomposition、Step Back 最大的不同是：

```text
前面几种方法生成的还是 query。
HyDE 生成的是一段假设性文档。
```

比如用户只问：

```text
为什么失败了？
```

这个 query 太短，缺少实体、动作、原因、背景等语义信息。直接拿它做向量检索，可能很难找到准确片段。

HyDE 会先让大模型生成一段可能的回答文档：

```text
失败通常不是由单一因素造成的，可能和准备不足、策略选择、关键节点判断、
对手能力变化、执行过程中的失误等因素有关。分析失败原因时，需要结合事件过程、
参与者行为、环境变化和最终结果进行综合判断。
```

这段假设文档不一定真实存在于知识库中。

但它有一个作用：包含了更多和问题语义相关的词。

然后系统不再对原始 query 做 embedding，而是对这段假设文档做 embedding，再用这个向量去检索真实文档。

所以 HyDE 的核心流程是：

```text
用户 query
  -> 生成假设性回答文档
  -> 假设文档 embedding
  -> 用假设文档向量检索真实文档
```

# 6. HyDE 的代码实现

HyDE 的生成部分也放在：

```text
src/rag_std/retrieval/query_translation.py
```

主要方法是：

```python
def build_hyde_prompt(self, query: str, num_documents: int) -> str:
    ...

def generate_hypothetical_documents(
    self,
    query: str,
    num_documents: int = 1,
) -> List[str]:
    ...

def hyde(self, query: str, num_documents: int = 1) -> List[str]:
    ...
```

`build_hyde_prompt(...)` 负责告诉模型应该生成什么样的假设文档。

我在 prompt 里写了几个约束：

- 生成的内容不一定真实存在于知识库中
- 文档应该像一段可能出现在知识库里的回答或说明
- 文档要比原始问题包含更丰富的语义词、背景信息、关键实体和可能的因果关系
- 不要只改写问题，要写成一段完整的假设性文档
- 不要编造过于具体的数字、日期、来源或不可验证细节
- 每篇文档控制在 120 到 220 字之间
- 只返回 JSON 字符串数组

这里我刻意限制了“不要编造过于具体的数字、日期、来源”。

因为 HyDE 本身就是生成假设文档，如果让模型编太细，很容易把完全不存在的细节写进去。虽然这些内容只是用于检索，不会直接作为最终答案，但过于具体的错误信息仍然可能把检索方向带偏。

`generate_hypothetical_documents(...)` 的逻辑和前面的 Step Back 类似：

```text
query 清洗
  -> 调用 DashScope Generation
  -> 解析 JSON 数组
  -> 去重
  -> 返回假设文档列表
```

# 7. HyDE 如何接入检索

HyDE 的后两步放在：

```text
src/rag_std/retrieval/retriever.py
```

对应方法是：

```python
def retrieve_hyde(
    self,
    query: str,
    top_k: int = 5,
    hypothetical_document_count: int = 1,
    rrf_k: int = 60,
) -> List[RetrievedChunk]:
    ...
```

这部分正好对应 HyDE 的后两个步骤：

```text
假设文档 embedding
用假设文档向量检索真实文档
```

代码流程是：

```text
如果没有 query_rewriter，或者 hypothetical_document_count <= 0：
  -> 回退到普通 retrieve

否则：
  -> generate_hypothetical_documents 生成假设文档
  -> 对每篇假设文档调用 embed_text(..., text_type="query")
  -> 用假设文档向量查询 ChromaDB
  -> 如果生成多篇假设文档，用 RRF 融合多路结果
```

这里有一个实现细节：

```python
hypothetical_embedding = self.embedder.embed_text(
    hypothetical_document,
    text_type="query",
)
```

虽然输入是一段“文档”，但它的用途是作为检索查询去查真实文档，所以这里 `text_type` 仍然使用 `"query"`。

这也是我这次实现时想清楚的一点：

```text
HyDE 生成的是文档形式的查询表达。
它不是要写入知识库的 document。
```

所以它更像是“扩写后的检索 query”，只是这个 query 的形式是一段完整文本。

# 8. Step Back 和 HyDE 的区别

这两个方法看起来都有“扩展语义”的作用，但方向不一样。

| 方法 | 生成内容 | 适合场景 | 检索方式 |
| --- | --- | --- | --- |
| Step Back | 更抽象的问题 | 具体问题需要背景、评价、原则、机制 | 原始 query 和抽象 query 分别检索，再 RRF |
| HyDE | 假设性回答文档 | 原始 query 太短、关键词不足、语义稀疏 | 假设文档 embedding 后检索真实文档 |

我自己的理解是：

```text
Step Back 是向上抽象。
HyDE 是向前假设。
```

Step Back 更像是在问：

```text
这个具体问题背后，更大的问题是什么？
```

HyDE 更像是在问：

```text
如果这个问题有一段可能的回答，它大概会长什么样？
```

两者都不是为了直接生成最终答案，而是为了让检索器更容易找到相关片段。

# 9. 为什么需要 Routing

到这里，项目里已经有了多种 query 优化路线：

```text
direct
  -> 直接检索

multi_query
  -> 多角度改写

decomposition
  -> 拆成多个子问题

step_back
  -> 生成更抽象的问题

hyde
  -> 生成假设性文档
```

如果全部靠命令行参数手动选择，会有两个问题。

第一个问题是使用成本变高。

每次提问之前，都要自己判断：

```text
这个问题适合 Multi Query 吗？
还是应该 Decomposition？
要不要 Step Back？
是不是 HyDE 更合适？
```

第二个问题是策略可能互相干扰。

比如同时打开：

```text
--multi-query-count 4
--decomposition-count 4
--step-back-count 1
```

理论上也能做，但实验结果就很难分析。到底是哪一种策略起了作用，或者是哪一种策略带来了噪声，会变得不清楚。

所以我把之前简单的“参数互斥判断”升级成了 Routing：

```text
先判断路线，再执行对应策略。
```

# 10. Routing 的代码实现

Routing 放在：

```text
src/rag_std/retrieval/routing.py
```

核心结构是 `RouteDecision`：

```python
@dataclass(frozen=True)
class RouteDecision:
    route: RouteName
    reason: str
    multi_query_count: int = 0
    decomposition_count: int = 0
    decomposition_mode: DecompositionMode = "parallel"
    step_back_count: int = 0
    hypothetical_document_count: int = 0
```

这个类表示一次路由决策。

比如：

```python
RouteDecision(
    route="step_back",
    reason="问题需要从具体事件上升到背景和评价。",
    step_back_count=1,
)
```

或者：

```python
RouteDecision(
    route="decomposition",
    reason="问题需要按多个阶段拆解。",
    decomposition_count=4,
    decomposition_mode="sequential",
)
```

这样 pipeline 后面不需要关心用户到底传了什么参数，只需要看 `route` 字段。

`QueryRouter` 主要有三类方法：

```python
def route(self, query: str) -> RouteDecision:
    ...

def route_from_parameters(...) -> RouteDecision:
    ...

def route_for_request(...) -> RouteDecision:
    ...
```

`route(...)` 是自动路由。

它会调用大模型，让模型从下面几条路线里选一个：

```text
direct
multi_query
decomposition
step_back
hyde
```

并要求模型只返回一个 JSON 对象。

这个 JSON 会被解析成 `RouteDecision`。

如果模型返回内容无法解析，系统会回退到：

```text
direct 普通检索
```

这个兜底很重要。

因为 Routing 是由大模型完成的，它可能会输出多余文字，也可能格式不稳定。不能让一次解析失败直接让整个 RAG 流程崩掉。

`route_from_parameters(...)` 是手动路由。

它根据用户传入的命令行参数判断路线。

例如：

```text
--step-back-count 1
```

会得到：

```text
route = "step_back"
step_back_count = 1
```

如果用户同时手动开启多个策略，就抛出错误：

```text
一次只能手动开启一种 query 优化策略；
如果希望模型自动选择路线，请使用 auto_route。
```

这样实验会更清楚。

`route_for_request(...)` 是统一入口。

它的规则是：

```text
如果 auto_route = True：
  -> 不能再手动指定 query 优化参数
  -> 调用 route(query)，让模型自动选择

如果 auto_route = False：
  -> 调用 route_from_parameters(...)
  -> 根据手动参数选择路线
```

也就是说，Routing 既支持手动实验，也支持自动选择。

# 11. Pipeline 里的路线分发

Routing 的结果会进入：

```text
src/rag_std/pipeline.py
```

`retrieve_context(...)` 里先调用：

```python
self.router.route_for_request(...)
```

得到 `RouteDecision` 后，再交给：

```python
self._retrieve_by_route(...)
```

`_retrieve_by_route(...)` 的职责很简单：

```text
如果 route == "hyde":
  -> retrieve_hyde

如果 route == "step_back":
  -> retrieve_step_back

如果 route == "decomposition":
  -> retrieve_decomposition

如果 route == "multi_query":
  -> retrieve_multi_query

否则：
  -> retrieve
```

这样 pipeline 变成了一个比较清晰的调度层。

它不需要知道 Step Back 的 prompt 怎么写，也不需要知道 HyDE 怎么生成假设文档。它只负责根据路由结果，把任务交给对应的 retriever 方法。

这一点对后续扩展很有帮助。

如果以后继续加入新的路线，比如 Query Construction 或者更复杂的 Agentic RAG，只需要：

```text
1. 在 routing.py 里增加 route 类型
2. 在 query_translation.py 或新模块里实现对应变换
3. 在 retriever.py 里接入检索
4. 在 pipeline.py 里增加分发分支
5. 在 cli.py 里补充参数
```

# 12. CLI 里如何测试

这次在 `cli.py` 里新增了三个参数：

```text
--step-back-count
--hypothetical-document-count
--auto-route
```

运行 Step Back：

```bash
uv run rag-std --query "皮卡丘为什么能击败火神？" --step-back-count 1
```

运行 HyDE：

```bash
uv run rag-std --query "为什么失败了？" --hypothetical-document-count 1
```

运行自动路由：

```bash
uv run rag-std --query "皮卡丘这场战斗体现了哪些能力？" --auto-route
```

如果开启 `--auto-route`，CLI 会额外打印：

```text
自动路由：decomposition
路由原因：问题需要从多个能力维度进行分析。
```

这样我可以观察模型为什么选择某条路线。

这对学习很有帮助。

因为很多时候我不只是想看最终答案，也想知道：

```text
系统为什么这样检索？
```

# 13. 当前几种路线的适用场景

整理到现在，我对几种路线的区别大概是这样理解的。

| 路线 | 适合的问题 | 主要作用 |
| --- | --- | --- |
| direct | 问题清楚、事实明确 | 不做额外处理，减少噪声 |
| multi_query | 意图单一，但说法可能很多 | 扩大召回范围 |
| decomposition | 问题复杂，天然可以拆成多个子问题 | 分解复杂意图 |
| step_back | 具体问题背后需要背景、评价、机制 | 抽象一层检索 |
| hyde | 问题很短，关键词不足 | 用假设文档补充语义 |

我觉得这张表也解释了为什么不能简单地“全部打开”。

因为每一种方法解决的问题不一样。

如果问题本来很简单，直接检索就足够了。强行 Multi Query 或 HyDE 反而可能引入噪声。

如果问题本身很复杂，Decomposition 往往比 Multi Query 更合适。

如果问题是具体事件但需要抽象评价，Step Back 比普通改写更有意义。

如果问题短到几乎没有可检索信息，HyDE 才比较有发挥空间。

# 14. 这次实现后的项目链路

现在完整链路可以写成：

```text
文档
  -> splitter 切块
  -> embedding 文档向量化
  -> vector_store 写入 ChromaDB

用户问题
  -> routing 判断路线
  -> query_translation 生成查询变换结果
  -> retriever 执行检索
  -> fusion 使用 RRF 融合多路结果
  -> reranker 精排候选片段
  -> generator 基于上下文生成回答
```

也可以从代码角度看：

```text
cli.py
  -> pipeline.answer(...)
  -> pipeline.retrieve_context(...)
  -> router.route_for_request(...)
  -> pipeline._retrieve_by_route(...)
  -> retriever.retrieve_xxx(...)
  -> reranker.rerank(...)
  -> generator.generate(...)
```

这比最开始的最小 RAG 要复杂不少。

但每一层的职责也更清楚了：

- Indexing 负责“文档怎么进库”
- Retrieval 负责“问题怎么找资料”
- Generation 负责“资料怎么变成回答”
- Pipeline 负责“把流程串起来”
- CLI 负责“方便自己实验”

# 15. 我对 Routing 的阶段性理解

这次做完以后，我对 Routing 的理解是：

```text
Routing 不是为了让系统看起来更智能。
它是为了让不同策略有一个清晰的入口。
```

如果没有 Routing，多个 query 优化策略会堆在一起：

```text
Multi Query 要开几个？
Decomposition 要不要开？
Step Back 要不要一起开？
HyDE 又什么时候用？
```

代码会慢慢变成一堆参数判断。

Routing 把这件事抽象成一个决策：

```text
当前 query -> RouteDecision
```

后面的模块只需要执行这个决策。

这让我感觉 RAG 系统开始从“线性流程”变成“可选择路线的流程”。

虽然还远远不是完整的 Agentic RAG，但已经有一点雏形：

```text
先判断问题类型，再选择工具或策略。
```

# 16. 当前实现的不足

这次实现还比较教学化，不算完整工程方案。

我目前看到几个不足：

第一，Routing 依赖大模型输出 JSON。

虽然代码里做了解析失败回退，但模型输出仍然可能不稳定。后续可以考虑更严格的结构化输出，或者增加规则兜底。

第二，HyDE 生成的假设文档可能带来噪声。

如果假设文档方向错了，检索也会跟着偏。所以 HyDE 不一定适合所有问题。

第三，目前还是一次只选择一条路线。

这样做方便观察实验结果，但复杂场景下可能需要组合路线。比如先 Decomposition，再对每个子问题做 Multi Query。不过那样会让检索成本和结果分析复杂很多，所以暂时没有做。

第四，当前测试语料还比较小。

小语料可以帮助理解流程，但不一定能充分体现 Step Back、HyDE 和 Routing 的效果。后面需要更多文档、更复杂的问题集，才能更真实地比较不同路线。

# 17. 下一步计划

下一步我想继续做几个方向。

在完善好 `query_translation` 之后，下一步重点就不是继续堆更多 query 改写方法，而是继续完善两件事：

```text
Routing
  -> 根据 question 判断应该查哪一种数据源、走哪一条检索路线

Query Construction
  -> 把用户问题转换成更精确的检索条件，比如关键词、过滤条件、metadata 约束等
```

也就是说，后面的重点会从“怎么改写问题”，逐渐转向“怎么根据问题找到正确的数据源”。

同时还需要继续增加 `data` 里的文档数量、文档种类和文档复杂度。因为只有测试语料足够丰富，后面的 Indexing 阶段才有优化空间，比如更细的 chunk 策略、metadata 设计、多文档 ingest、来源追踪和结构化检索。

第一，整理一组固定测试问题。

比如：

```text
事实型问题
原因分析问题
多阶段问题
评价型问题
短 query 问题
```

然后分别观察 Routing 会选什么路线。

第二，记录每次检索的中间结果。

包括：

```text
生成了哪些 query
生成了哪些 Step Back 问题
生成了哪些 HyDE 假设文档
RRF 前后排序有什么变化
最终哪些片段进入了 generation
```

这些中间结果比最终答案更适合学习。

第三，继续优化多文档 ingest。

现在项目可以用多个测试文档，但向量库写入时还需要更好地处理 chunk id、来源文件和 metadata。后面可以给每个 chunk 加上：

```text
source
chunk_index
title
section
```

这样检索结果会更容易分析。

第四，考虑 Query Construction。

现在做的 Query Translation 主要面向自然语言 query。如果知识库里有结构化 metadata，后续可以研究如何把用户问题转成带过滤条件的查询。

# 18. 小结

这篇主要补完了 Query Translation 后半部分的几个能力：

```text
Step Back
  -> 从具体问题生成抽象问题
  -> 原始 query 和 Step Back query 分别检索
  -> 用 RRF 融合结果

HyDE
  -> 生成假设性回答文档
  -> 对假设文档做 embedding
  -> 用假设文档向量检索真实文档

Routing
  -> 根据用户问题选择 direct / multi_query / decomposition / step_back / hyde
  -> 支持手动参数和 auto_route 自动路由
  -> 让 pipeline 不再靠零散参数判断策略
```

如果说第一篇是在跑通最小 RAG，第二篇是在扩展 Query Translation，那么这一篇更像是在给这些策略加一个统一入口。

到这里，项目已经不只是“用户问题 -> 向量检索 -> 回答”的直线流程了。

它开始有了一个更清楚的检索前阶段：

```text
先理解问题类型。
再决定如何改写或扩展问题。
最后把更适合检索的表达交给向量数据库。
```

这也是我目前对 RAG 学习最深的一点体会：

```text
RAG 的质量，不只取决于生成模型。
很多时候，真正决定答案质量的，是检索前有没有把问题处理好。
```
