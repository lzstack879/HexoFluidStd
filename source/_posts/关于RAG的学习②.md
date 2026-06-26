---
title: 关于 RAG 的学习②：完善 Query Translation
date: 2026-06-25 23:04:11
categories:
  - 学习成长
tags:
  - RAG
  - 大模型
  - Query Translation
  - RAG Fusion
  - Decomposition
---

这篇是我学习 RAG 的第二篇自学笔记。

上一篇主要是把最小 RAG Demo 的基础链路跑通：文档切块、Embedding、向量数据库、检索、Rerank 和生成回答。那一篇更像是在搭骨架，这一篇是在骨架上继续补 query 阶段的能力。

这一篇继续往前推进，重点放在 **Query Translation**，也就是“在真正检索之前，先把用户的问题处理得更适合检索”。

这次主要是边改代码边整理自己的理解，目前实现了三个方向：

```text
Multi Query
  -> 将原始问题从多个角度改写

RAG Fusion
  -> 对多路检索结果做 RRF 融合排序

Decomposition
  -> 将复杂问题拆解成多个子问题
```

对应的学习仓库仍然是：

[RAG_Std](https://github.com/lzstack879/RAG_Std)

<!-- more -->

这篇不是完整教程，更像是我把代码改完之后，对自己做的一次复盘：为什么要做 query 阶段优化、每个方法解决什么问题、代码里分别放在什么位置，以及下一步准备继续补什么。

# 1. 为什么要优化 Query 阶段

在最小 RAG 里，检索流程很直接：

```text
用户问题
  -> 问题向量化
  -> 向量数据库检索
  -> 返回相似片段
```

这条链路可以跑通，但它有一个明显问题：**所有检索结果都依赖用户原始问题的表达方式。**

如果用户问得很直接，比如：

```text
皮卡丘使用了什么技能？
```

向量检索通常比较容易找到相关片段。

但如果用户的问题更抽象：

```text
皮卡丘为什么能击败火神？
```

这个问题不只是问技能清单，还可能涉及：

- 皮卡丘用了哪些技能
- 小智做了哪些战术判断
- 火神的弱点是什么
- 哪些技能分别承担了速度、控制、防御和终结作用

如果只拿原始 query 去检索，召回结果可能会偏窄。

所以 Query Translation 的核心目标是：

```text
不要急着检索。
先把用户问题转换成更适合检索的形式。
```

这是我现在对 Query Translation 的第一层理解：它发生在检索之前，但会直接影响后面所有步骤。

# 2. 当前项目的 Query Translation 架构

这一轮修改之后，项目的 RAG 流程变成了：

```text
用户问题
  -> 可选：Multi Query 多角度改写
  -> 可选：Decomposition 问题拆解
  -> 多路向量检索
  -> RRF 融合排序
  -> 可选 ReRank
  -> 拼接 Prompt
  -> Qwen 生成回答
```

对应的代码模块主要有三个：

```text
query_rewriter.py
  -> 负责 query 改写和问题拆解

fusion.py
  -> 负责 RRF 融合排序

retriever.py
  -> 负责把 query 变换结果真正送去检索
```

`pipeline.py` 负责选择走哪一种检索路线，`cli.py` 负责把这些能力暴露成命令行参数。

我现在对这几个模块的阶段性理解是：

```text
query_rewriter.py 解决“问什么”
retriever.py      解决“怎么查”
fusion.py         解决“多路结果怎么合并”
pipeline.py       解决“整条流程怎么串起来”
```

# 3. Multi Query：从多个角度改写问题

Multi Query 的想法很直接：同一个问题可以有很多种说法，不同说法可能检索到不同片段。

例如原始问题是：

```text
皮卡丘为什么能击败火神？
```

模型可以改写成：

```text
皮卡丘战胜火神的关键原因是什么？
小智和皮卡丘用了哪些战术打败火神？
皮卡丘在火神试炼中依靠哪些能力获胜？
火神为什么没有压制住皮卡丘？
```

这些 query 的意思接近，但关注点不一样。

有的偏技能，有的偏战术，有的偏火神弱点，有的偏整体评价。让它们分别检索，可以扩大召回范围。

在代码里，这部分放在 `query_rewriter.py`。

核心类是：

```python
class QueryRewriter:
    """提供查询改写、问题拆解等查询变换能力。"""
```

Multi Query 的系统提示词是：

```python
QUERY_REWRITE_SYSTEM_PROMPT = (
    "你是一个面向 RAG 检索器的查询改写助手。"
    "请在保持用户原始意图不变的前提下，从多个有用角度改写问题。"
)
```

真正构造 prompt 的函数是：

```python
def build_prompt(self, query: str, num_queries: int) -> str:
    return f"""请将下面的问题改写成 {num_queries} 个多样化的检索查询。

可以根据需要使用这些策略：
- 使用同义词替换。
- 扩展相近语义。
- 删除冗余词。
- 纠正明显错误。
- 将模糊或口语化表达标准化。

规则：
- 保持原问题的语义不变。
- 使用和输入问题相同的语言。
- 不要回答问题。
- 只返回一个 JSON 字符串数组。

问题：{query}
"""
```

这里我特别要求模型：

```text
只返回一个 JSON 字符串数组
```

原因是后续代码需要稳定解析。如果模型输出一段自然语言说明，就会增加解析难度。

调用模型的入口是：

```python
def rewrite(self, query: str, num_queries: int = 4) -> List[str]:
    ...
```

它会完成几件事：

1. 清理原始 query。
2. 调用 DashScope 的生成模型。
3. 解析模型返回的 JSON 数组。
4. 对 query 去重。
5. 返回指定数量的改写问题。

为了保证原始问题不丢失，我又加了一个方法：

```python
def rewrite_with_original(self, query: str, num_queries: int = 4) -> List[str]:
    ...
```

它返回的是：

```text
原始 query + 改写 query
```

这样做的原因是：改写问题能扩大召回，但原始问题仍然是用户最真实的表达，不能丢。

# 4. Multi Query 如何接入检索

生成多个 query 之后，还需要真正去检索。

这部分在 `retriever.py` 里完成。

普通检索是：

```python
def retrieve(self, query: str, top_k: int = 5) -> List[RetrievedChunk]:
    query_embedding = self.embedder.embed_query(query)
    return self.vector_store.query(query_embedding=query_embedding, top_k=top_k)
```

它只处理一个 query。

Multi Query 检索则是：

```python
def retrieve_multi_query(
    self,
    query: str,
    top_k: int = 5,
    rewrite_count: int = 4,
    rrf_k: int = 60,
) -> List[RetrievedChunk]:
    ...
```

整体逻辑是：

```text
原始 query
  -> 生成多个改写 query
  -> 每个 query 分别 retrieve
  -> 得到多组检索结果
  -> 使用 RRF 融合排序
  -> 返回最终 top_k
```

代码里的关键片段是：

```python
queries = self.query_rewriter.rewrite_with_original(
    query=query,
    num_queries=rewrite_count,
)

results_by_query = [
    self.retrieve(rewritten_query, top_k=top_k)
    for rewritten_query in queries
]
```

这里的 `results_by_query` 是一个二维列表。

可以理解成：

```text
[
  第一个 query 的检索结果,
  第二个 query 的检索结果,
  第三个 query 的检索结果,
  ...
]
```

到这里，问题就变成了：

```text
多路检索结果怎么合并？
```

这就需要 RAG Fusion。

# 5. RAG Fusion：用 RRF 融合多路结果

Multi Query 会带来多个检索结果列表。

最简单的做法是取并集，但这样会有两个问题：

1. 不知道哪个文档更重要。
2. 没有利用“同一个文档被多个 query 命中”这个信号。

所以这次我实现了 RAG Fusion 里常用的 RRF，也就是 **Reciprocal Rank Fusion，倒数排名融合**。

它的直觉是：

```text
如果一个文档被多个 query 都检索到了，
而且在多个结果里排名都靠前，
它就应该排得更靠前。
```

RRF 不直接使用向量数据库返回的 distance，而是使用排名。

公式是：

```text
score += weight / (rrf_k + rank)
```

其中：

- `rank` 是文档在某一路检索结果中的排名，从 1 开始。
- `weight` 是该路 query 的权重，默认是 1。
- `rrf_k` 是平滑参数，默认是 60。

举个简单例子。

如果文档 A 在三个 query 的结果里都排在前面，它的分数会被加三次。

如果文档 B 只在一个 query 里出现，即使它排得比较靠前，总分也可能不如 A。

这很符合 RAG Fusion 的目标：**让多个检索视角共同认可的内容排到前面。**

# 6. fusion.py 的实现

代码整理时，我把 RRF 单独放到了 `fusion.py`，没有塞进 `retriever.py`。

这样做是为了让职责更清楚：

```text
retriever.py 负责检索
fusion.py    负责融合排序
```

`fusion.py` 里先定义了一个带分数的结果结构：

```python
@dataclass
class RankedChunk:
    """带有融合分数的检索片段。"""

    chunk: RetrievedChunk
    score: float
```

这个结构保留了两个东西：

- `chunk`：原始检索片段
- `score`：RRF 算出来的融合分数

核心函数是：

```python
def reciprocal_rank_fusion(
    results_by_query: Sequence[Sequence[RetrievedChunk]],
    top_k: int | None = None,
    rrf_k: int = 60,
    weights: Sequence[float] | None = None,
) -> list[RankedChunk]:
    ...
```

它的输入是多路检索结果：

```text
results_by_query = [
  [A, B, C],
  [B, D, A],
  [A, E, B],
]
```

函数内部维护两个字典：

```python
scores: dict[str, float] = {}
chunks: dict[str, RetrievedChunk] = {}
```

`scores` 用来累计每个 chunk 的 RRF 分数。

`chunks` 用来保存 chunk id 对应的真实片段对象。

最关键的一句是：

```python
scores[chunk.id] = scores.get(chunk.id, 0.0) + weight / (rrf_k + rank)
```

这句话完成了分数累加。

如果同一个 chunk 在多路结果中出现，它就会被多次加分。

最后再按分数从高到低排序：

```python
ranked_chunks.sort(key=lambda item: item.score, reverse=True)
```

为了方便现有 RAG 流程使用，我又封装了一个只返回片段、不返回分数的方法：

```python
def reciprocal_rank_fusion_chunks(...) -> list[RetrievedChunk]:
    ...
```

因为后面的 reranker 和 generator 只需要文档片段，不一定需要 RRF 分数。

# 7. Decomposition：把复杂问题拆成子问题

Multi Query 是“同一个问题的不同说法”。

Decomposition 则是“把一个复杂问题拆成多个小问题”。

例如：

```text
皮卡丘为什么能击败火神？
```

这个问题可以拆成：

```text
火神有哪些主要攻击方式？
皮卡丘使用了哪些技能应对火神？
小智做出了哪些战术判断？
皮卡丘最终如何完成决定性一击？
```

这些子问题分别检索，最后再合并结果，通常比只检索原始问题更稳。

在 `query_rewriter.py` 里，我给 Decomposition 设计了两种模式。

第一种是并行拆解：

```text
parallel
```

子问题之间尽量互不依赖。每个子问题都可以单独检索和回答，最后再合并答案。

适合这种问题：

```text
皮卡丘这场战斗体现了哪些能力？
```

它可以拆成速度、控场、防御、爆发等多个维度。

第二种是逐步拆解：

```text
sequential
```

子问题按解决顺序排列，后一个子问题可以依赖前一个子问题的答案。

适合这种问题：

```text
皮卡丘如何一步步赢下火神试炼？
```

它更像按战斗阶段推进：

```text
开局发生了什么？
皮卡丘如何避开火焰冲击？
中段如何改变战场节奏？
最后如何击退火神？
```

# 8. Decomposition 的代码实现

Decomposition 的系统提示词是：

```python
QUERY_DECOMPOSITION_SYSTEM_PROMPT = (
    "你是一个面向 RAG 检索器的问题拆解助手。"
    "请将复杂问题拆成更容易检索和回答的子问题。"
)
```

构造 prompt 的函数是：

```python
def build_decomposition_prompt(
    self,
    query: str,
    num_questions: int,
    mode: Literal["parallel", "sequential"],
) -> str:
    ...
```

这个函数会根据 `mode` 生成不同说明。

如果是逐步拆解：

```text
- 子问题必须按解决顺序排列。
- 后一个子问题可以依赖前一个子问题的答案。
- 每个子问题都应该推动下一步推理或检索。
```

如果是并行拆解：

```text
- 子问题之间应尽量相互独立。
- 每个子问题都可以单独检索和回答。
- 最后可以把多个子问题的答案合并成原问题的完整答案。
```

通用入口是：

```python
def decompose(
    self,
    query: str,
    num_questions: int = 4,
    mode: Literal["parallel", "sequential"] = "parallel",
) -> List[str]:
    ...
```

为了调用更清晰，我还加了两个快捷方法：

```python
def decompose_parallel(self, query: str, num_questions: int = 4) -> List[str]:
    ...

def decompose_sequential(self, query: str, num_questions: int = 4) -> List[str]:
    ...
```

这样后续使用时可以直接看出意图。

# 9. Decomposition 如何接入检索

问题拆解之后，也要走多路检索。

这部分我接在了 `retriever.py` 里：

```python
def retrieve_decomposition(
    self,
    query: str,
    top_k: int = 5,
    decomposition_count: int = 4,
    decomposition_mode: Literal["parallel", "sequential"] = "parallel",
    rrf_k: int = 60,
) -> List[RetrievedChunk]:
    ...
```

它的流程是：

```text
原始 query
  -> 拆成多个子问题
  -> 每个子问题分别检索
  -> 得到多路检索结果
  -> 使用 RRF 融合排序
  -> 返回 top_k
```

关键代码是：

```python
sub_questions = self.query_rewriter.decompose(
    query=query,
    num_questions=decomposition_count,
    mode=decomposition_mode,
)

results_by_question = [
    self.retrieve(sub_question, top_k=top_k)
    for sub_question in sub_questions
]
```

最后仍然调用 RRF：

```python
return reciprocal_rank_fusion_chunks(
    results_by_query=results_by_question,
    top_k=top_k,
    rrf_k=rrf_k,
)
```

这说明 Multi Query 和 Decomposition 虽然生成 query 的方式不同，但后面的多路检索和 RRF 融合是可以复用的。

# 10. Pipeline 里的策略选择

`pipeline.py` 负责把这些模块串起来。

现在 `retrieve_context` 支持三个模式：

```text
普通检索
Multi Query 检索
Decomposition 检索
```

对应参数是：

```python
multi_query_count: int = 0
decomposition_count: int = 0
decomposition_mode: Literal["parallel", "sequential"] = "parallel"
```

目前我先让 Multi Query 和 Decomposition 保持互斥，也就是一次只开启一种 query 优化策略：

```python
if multi_query_count > 0 and decomposition_count > 0:
    raise ValueError("multi_query_count 和 decomposition_count 不能同时大于 0。")
```

这样做不是因为两者一定不能组合，而是为了当前阶段的实验更清楚。现在我还在分别观察 Multi Query 和 Decomposition 对召回结果的影响，如果两个策略同时开启，结果变好或变差时就很难判断原因。

后面我打算把这部分继续升级成 Routing。

也就是不再手动指定：

```text
这次用 Multi Query
这次用 Decomposition
```

而是让大模型先判断用户问题属于哪种类型，再自动选择合适的检索路线。

例如：

```text
事实型问题
  -> 普通检索

表达模糊但意图单一的问题
  -> Multi Query

复杂分析类问题
  -> Decomposition

更抽象的评价类问题
  -> Step Back

语义较短但需要丰富上下文的问题
  -> HyDE
```

这样 `pipeline.py` 里的策略选择就会从“手动参数开关”逐步变成“模型路由决策”。当前的互斥限制更像是一个过渡设计，先保证每条路线都能单独跑通，再考虑把它们交给 Routing 统一调度。

如果开启 Decomposition：

```python
retrieved = self.retriever.retrieve_decomposition(...)
```

如果开启 Multi Query：

```python
retrieved = self.retriever.retrieve_multi_query(...)
```

如果都不开启：

```python
retrieved = self.retriever.retrieve(query, top_k=retrieve_top_k)
```

最后无论走哪条路线，都可以继续执行 rerank：

```python
if rerank_top_k:
    return self.reranker.rerank(query, retrieved, top_k=rerank_top_k)
```

这里我对 RRF 和 Rerank 的理解是：

```text
RRF 负责合并多路检索结果。
Rerank 负责基于原始问题对候选片段精排。
```

两者不是互相替代，而是前后配合。

# 11. CLI 里如何测试

为了方便自己反复测试，我在 `cli.py` 里加了几个参数。

普通 RAG：

```bash
uv run rag-std --query "皮卡丘使用了什么技能？"
```

Multi Query：

```bash
uv run rag-std --query "皮卡丘为什么能击败火神？" --multi-query-count 4
```

Decomposition 并行拆解：

```bash
uv run rag-std --query "皮卡丘这场战斗体现了哪些能力？" --decomposition-count 4 --decomposition-mode parallel
```

Decomposition 逐步拆解：

```bash
uv run rag-std --query "皮卡丘如何一步步赢下火神试炼？" --decomposition-count 4 --decomposition-mode sequential
```

这里的几个示例 query 不是随便选的。

`皮卡丘使用了什么技能？` 更适合普通检索，因为它是一个直接事实问题。

`皮卡丘为什么能击败火神？` 更适合 Multi Query，因为它可以从技能、战术、火神弱点、最终招式多个角度改写。

`皮卡丘这场战斗体现了哪些能力？` 更适合并行拆解，因为它天然包含多个评价维度。

`皮卡丘如何一步步赢下火神试炼？` 更适合逐步拆解，因为它按战斗阶段展开。

# 12. 当前测试文档的变化

为了更好测试这些 query 优化方法，我也把 `data/raw/doc.md` 改成了更故事化的文档。

它不再是简单的问答清单，而是一篇连续叙事：

```text
小智和皮卡丘误入火神试炼场
  -> 火神发动火焰冲击
  -> 皮卡丘用电光一闪闪避
  -> 用十万伏特远程压制
  -> 用电网限制火神移动
  -> 用铁尾挡住近身爪击
  -> 最后用伏特攻击击退火神
```

同时文档里也保留了容易混淆的信息：

```text
皮卡丘没有使用打雷
皮卡丘没有使用影子分身
电网和十万伏特不是同一个技能
```

这样设计的原因是：真实文档往往不是规整问答，而是叙事、分析、纠错混在一起。只有在这种文档里测试，才能更明显地看出 Query Translation 的价值。

我还补充了几个辅助文档：

```text
battle_report.md
strategy_notes.md
rumor_corrections.md
```

它们分别偏战斗记录、战术分析和传闻纠错。后面如果支持多文档 ingest，可以继续用这些文档测试。

# 13. 我对 Query Translation 的阶段性理解

这次做完之后，我对 Query Translation 的理解比第一篇更清楚了一点。

它不是单纯“让模型把问题改写得更好听”，而是为了检索服务。

可以粗略分成三种目的：

```text
Multi Query
  -> 扩大语义覆盖面

Decomposition
  -> 把复杂问题拆成可检索的小问题

RAG Fusion
  -> 把多路检索结果合并成稳定排名
```

其中 Multi Query 和 Decomposition 都发生在检索前，RAG Fusion 发生在多路检索后。

也就是说，这一阶段其实是在优化：

```text
用户问题
  -> 检索请求
  -> 候选上下文
```

而不是直接优化最终生成。

这也让我意识到，RAG 的很多问题并不是生成模型本身造成的，而是检索上下文不够好造成的。

如果检索阶段没有找到合适材料，大模型后面只能在不完整上下文里回答。Query Translation 的意义，就是在资料进入大模型之前，尽量把“找资料”这一步做稳。

# 14. 下一步计划：Step Back

Query Translation 里还剩两个方向我准备继续做。

第一个是 Step Back。

Step Back 的思路是：从一个具体问题生成一个更高层次、更抽象的问题。

例如具体问题是：

```text
皮卡丘为什么能击败火神？
```

Step Back 之后可能变成：

```text
这场战斗体现了皮卡丘和小智怎样的配合能力？
```

或者：

```text
复杂战斗中，弱势一方如何通过战术和技能组合取得胜利？
```

这种抽象问题有时能检索到更总结性的文档段落。

我准备把 Step Back 也放在 `query_rewriter.py` 中，作为一个新的查询变换方法。

大致接口可以是：

```python
def step_back(self, query: str, num_questions: int = 1) -> List[str]:
    ...
```

后续检索时可以这样做：

```text
原始 query
  -> 生成 step-back query
  -> 原始 query 和抽象 query 分别检索
  -> RRF 融合
```

这和 Multi Query 的结构很像，只是改写方向更偏抽象化。

# 15. 下一步计划：HyDE

第二个方向是 HyDE。

HyDE 的全称是：

```text
Hypothetical Document Embeddings
```

它的思路和 Multi Query、Decomposition 不太一样。

Multi Query 和 Decomposition 生成的是问题。

HyDE 生成的是一段假设性文档。

例如用户问：

```text
皮卡丘为什么能击败火神？
```

HyDE 会先让大模型生成一段可能的回答文档：

```text
皮卡丘能够击败火神，是因为它通过电光一闪躲避火焰冲击，
用十万伏特削弱火神防御，用电网限制移动，
再用铁尾完成近身防守，最后用伏特攻击完成决定性一击。
```

这段文档不一定真实存在于知识库里，所以叫“假设性文档”。

然后系统不是直接拿原始 query 去 embedding，而是拿这段假设性文档去 embedding，再用它检索真实文档。

流程大概是：

```text
用户 query
  -> 生成假设性回答文档
  -> 对假设文档做 embedding
  -> 用假设文档向量检索真实文档
  -> 得到更接近答案语义的片段
```

HyDE 的直觉是：用户的问题可能很短，但模型生成的假设答案会包含更多语义词，比如技能名、战术名、事件关系。用这段更丰富的文本去检索，可能比短 query 更容易找到相关文档。

我准备后面这样接入：

```text
query_rewriter.py
  -> generate_hypothetical_document()

retriever.py
  -> retrieve_hyde()

pipeline.py
  -> 增加 hyde 开关

cli.py
  -> 增加 --hyde 参数
```

这会让 Query Translation 阶段形成更完整的四个方向：

```text
Multi Query
RAG Fusion
Decomposition
Step Back
HyDE
```

# 16. 小结

这一篇的重点是把 RAG 的 query 阶段往前推进了一步。

第一篇里，系统还是：

```text
用户问题
  -> 直接检索
  -> 生成答案
```

现在变成：

```text
用户问题
  -> Query Translation
  -> 多路检索
  -> RRF 融合
  -> ReRank
  -> 生成答案
```

这让我更明确地看到：RAG 的优化不只是换模型，也不只是换向量数据库。很多时候，真正影响召回质量的是“怎么把用户问题变成更好的检索请求”。

接下来我准备继续完成 Query Translation 的最后两个方向：

```text
Step Back
HyDE（Hypothetical Document Embeddings）
```

等这两个方向补完之后，Query Translation 这一块就会更完整。然后再继续往后看 Routing、Query Construction、Indexing 、 Retrieval 和Generation的进一步优化。
