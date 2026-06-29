---
title: 关于 RAG 的学习④：长文档 Indexing、数据源 Routing 和 Query Construction
date: 2026-06-29 20:32:24
categories:
  - 学习成长
tags:
  - RAG
  - 大模型
  - Indexing
  - Semantic Chunking
  - Routing
  - Query Construction
  - SQLite
---

这篇是我学习 RAG 的第四篇自学笔记。

前三篇基本把一个 RAG Demo 从“最小闭环”推进到了比较完整的 Query Translation 阶段：

```text
最小 RAG
  -> Multi Query
  -> RAG Fusion
  -> Decomposition
  -> Step Back
  -> HyDE
  -> Routing
```

这一篇继续往后走，重点不再只是“用户问题怎么改写”，而是开始处理两个更接近真实项目的问题：

```text
文档越来越长，应该怎么切？
用户问题越来越复杂，应该怎么构造搜索参数？
```

所以这次主要做了三类改动：

```text
Indexing
  -> 把测试文档换成《红楼梦》
  -> 实现结构优先的语义分块
  -> 把切分后的 chunk 保存到 SQLite

Routing
  -> 不只选择 query 优化路线
  -> 也开始根据问题选择数据源和 Prompt

Query Construction
  -> 把自然语言 question 转成结构化搜索参数
  -> 用关键词和过滤条件去 SQLite chunks 里搜索
```

对应的学习仓库仍然是：

[RAG_Std](https://github.com/lzstack879/RAG_Std)

<!-- more -->

这次最大的感觉是：RAG 不是只有“检索”和“生成”。真正开始处理长文档以后，Indexing 阶段会变得非常重要。文档怎么切、切完怎么存、后续怎么查，这些都会影响 Retrieval 的上限。

# 1. 为什么这次换成《红楼梦》

之前的测试文档是自己写的小型故事语料，围绕“皮卡丘与火神试炼”展开。它的好处是简单，适合理解 Query Translation、RRF 和 Routing。

但小文档也有一个问题：很多真实 RAG 场景里的困难不会暴露出来。

比如：

```text
文档很长怎么办？
章节结构怎么保留？
一个章节太大时怎么继续切？
目录会不会污染检索？
chunk 切完以后怎么检查？
```

所以这次我把数据换成了 `data/红楼梦.txt`。

《红楼梦》很适合做长文档 RAG 的测试语料，因为它有几个特点：

- 文档足够长。
- 有一百二十回的清晰章回结构。
- 有人物、地点、诗词、判词、情节和主题分析等多种查询类型。
- 目录和正文里都会出现回目，容易测试结构识别是否足够细。

这也让我意识到：小文档阶段可以先按空行切块，但到了长篇小说这种文档，简单切块就不够了。

# 2. 当前项目结构的变化

这一版之后，项目仍然按 RAG 三个阶段组织：

```text
src/rag_std/
  indexing/
    splitter.py
    embedding.py
    chunk_store.py
    vector_store.py

  retrieval/
    query_translation.py
    routing.py
    query_construction.py
    fusion.py
    retriever.py
    reranker.py

  generation/
    generator.py

  pipeline.py
  cli.py
```

这次新增或重点修改的模块是：

```text
splitter.py
  -> 结构优先的语义分块

chunk_store.py
  -> 保存和搜索切分后的 chunks

routing.py
  -> 数据源 Routing 和 Semantic Prompt Routing

query_construction.py
  -> 把自然语言 question 转成结构化搜索参数

pipeline.py / cli.py
  -> 把这些能力串起来，方便测试
```

如果说前三篇主要是在 Retrieval 阶段往前推进，那么这一篇开始明显触碰到 Indexing 和 Retrieval 的交界处。

# 3. 结构优先的 Semantic Chunking

一开始我直接做了 Semantic Chunking：

```text
文本
  -> 切成语义单元
  -> 对语义单元做 embedding
  -> 计算相邻语义单元的距离
  -> 在距离突变的位置切分
```

这个思路本身没有问题，但放到小说上还不够自然。

因为小说本身就有很强的物理结构：

```text
第一回
第二回
第三回
...
第一二零回
```

如果完全忽略这些结构，直接用 embedding 断点切分，就有点可惜。更合理的方式应该是：

```text
先尊重文档自己的结构。
如果结构段太大，再使用语义分块。
```

所以现在默认切块策略叫：

```text
structure_semantic
```

它的流程是：

```text
长篇小说
  -> 先按“第几回 / 卷 / 章 / 节”等显式结构切分
  -> 在章节内部按“却说 / 话说 / 一日 / 次日”等显性场景转换做物理切分
  -> 如果结构段或场景段仍然过大，再使用 Semantic Chunking
  -> 给子 chunk 保留章节标题
```

这里我觉得最重要的是“物理结构优先”。

因为章回标题本身就是一种非常有价值的 metadata。即使现在还没有把 metadata 单独建表，至少把回目保留在 chunk 文本开头，也能让检索结果更容易理解。

# 4. 处理目录污染

《红楼梦.txt》里有一个细节：目录里有一百二十个回目，正文里也有一百二十个回目。

如果直接用正则匹配：

```text
^第...回
```

会匹配到 240 个标题。

这显然不对。目录里的回目只是导航信息，不应该作为正文 chunk 参与检索。否则用户问“林黛玉进贾府”，系统可能召回目录，而不是正文。

所以在 `split_by_document_structure(...)` 里，我加了一个判断：

```text
如果标题行末尾带页码，并且处于“目录”部分
  -> 跳过
```

实际验证时，结构识别结果变成：

```text
sections: 120
first section head: 第一回 甄士隐梦幻识通灵 贾雨村风尘怀闺秀
last section head: 第一二零回 甄士隐详说太虚情 贾雨村归结红楼梦
```

这说明目录没有进入 chunk，正文的一百二十回被识别出来了。

这个小问题让我对 Indexing 有了更具体的感觉：文档切块不是单纯“切字符串”。它更像是在做文档结构理解。

# 5. Semantic Chunking 的实现思路

当一个结构段仍然太长时，再进入语义分块。

现在的语义分块逻辑大致是：

```text
长文本
  -> 按中文标点和换行切成句子
  -> 合并成较短的语义单元
  -> 对每个语义单元做 embedding
  -> 计算相邻语义单元的 cosine distance
  -> 取距离的某个百分位作为断点阈值
  -> 在语义变化较大的位置切分
```

CLI 里可以调几个参数：

```text
--chunk-strategy
--chunk-max-chars
--chunk-overlap
--semantic-unit-chars
--semantic-breakpoint-percentile
```

比如：

```bash
uv run rag-std --chunk-strategy structure_semantic --chunk-max-chars 1200
```

当前默认是：

```text
chunk_max_chars = 1200
chunk_overlap = 120
semantic_unit_chars = 420
semantic_breakpoint_percentile = 82
```

用假的 embedding 函数验证时，大致结果是：

```text
chunks: 1167
median: 901
p95: 1191
max: 1200
```

这不是最终最优参数，但已经比之前按空行切出一百多个超大 chunk 要合理很多。

# 6. Embedding 批量上限的小坑

做 Semantic Chunking 时，需要对很多语义单元做 embedding。

我一开始给 embedding 批量调用设了一个比较大的 batch size，结果 DashScope 返回了错误：

```text
batch size is invalid, it should not be larger than 10
```

也就是说，接口限制一次最多传 10 条。

所以我在 `embedding.py` 里加了一个常量：

```python
MAX_EMBEDDING_BATCH_SIZE = 10
```

并且不管外部传多大的 batch size，最终都会 clamp 到 10。

这个问题虽然小，但很真实。RAG 里的很多工程问题，不在算法本身，而在模型服务、批量限制、速率限制、超时和重试这些地方。

# 7. 为什么把 chunk 存到 SQLite

之前切完 chunk 后，系统会直接：

```text
chunks
  -> embedding
  -> ChromaDB
```

这样可以跑通向量检索，但有一个问题：切分结果不容易观察。

我想知道：

```text
到底切出了多少块？
每块多长？
每块文本是什么？
是不是目录混进来了？
章节标题有没有保留？
```

所以这次新增了：

```text
src/rag_std/indexing/chunk_store.py
```

里面有一个 `SQLiteChunkStore`，负责把切分后的结果保存到 SQLite。

保存的表叫 `chunks`，主要字段包括：

```text
chunk_id
source_path
chunk_index
text
char_count
chunk_strategy
chunk_max_chars
chunk_overlap
semantic_unit_chars
semantic_breakpoint_percentile
created_at
```

CLI 默认会把切分结果保存到：

```text
data/chunks.sqlite3
```

也可以关闭：

```bash
uv run rag-std --chunk-db ""
```

我现在对 SQLite 的定位不是替代 ChromaDB，而是作为一个可检查、可调试的 chunk 存储层。

ChromaDB 负责向量检索；SQLite 负责让我看清楚 Indexing 阶段到底产出了什么。

# 8. SQLite 关键词检索

既然 chunk 已经存到 SQLite，就可以进一步做关键词检索。

所以 `SQLiteChunkStore` 里又加了：

```python
search_chunks(...)
```

它支持：

```text
content_search
title_search
source_path
max_char_count
limit
```

`content_search` 会在完整 chunk 文本里查。

`title_search` 会优先查 chunk 前 160 个字符，因为当前 chunk 开头通常保留了回目标题。

一开始我写成所有关键词都必须命中，后来发现太严格了。

比如问题是：

```text
林黛玉第一次进贾府时见到了哪些人？
```

规则构造出的关键词可能是：

```text
林黛玉 贾府 见到
```

但正文里可能写的是“拜见贾母”，不一定出现“见到”。如果要求所有关键词都命中，就会漏掉相关 chunk。

所以后来改成：

```text
任一关键词命中即可召回。
再按命中数排序。
标题命中的权重更高。
```

这更符合当前 Query Construction 阶段的目标：先做宽召回，再交给后续检索或重排精排。

# 9. Routing 从路线选择扩展到数据源选择

上一篇的 Routing 主要解决的是：

```text
当前 query 应该走 direct / multi_query / decomposition / step_back / hyde 哪条路线？
```

这一版继续扩展了一步：

```text
当前 question 更适合查哪一类资源？
当前 question 更适合使用哪一种 Prompt？
```

所以 `routing.py` 里现在除了 `QueryRouter`，还增加了：

```text
SourceRouter
SemanticPromptRouter
```

默认的数据源抽象成了几类：

```text
红楼梦正文
人物关系线索
诗词判词与象征
主题评析线索
```

对应的意图也更贴近《红楼梦》：

```text
事实查询
人物关系查询
诗词象征查询
主题评析查询
```

例如：

```text
贾宝玉和林黛玉是什么关系？
  -> 人物关系线索

金陵十二钗判词有什么象征意义？
  -> 诗词判词与象征

黛玉葬花体现了什么主题？
  -> 主题评析线索
```

目前这些 source_id 还没有真正映射到不同 collection 或不同 metadata filter。它更像是先把接口和概念搭起来。

后面如果继续完善，可以把：

```text
source_id
```

映射到：

```text
不同 SQLite 查询条件
不同 Chroma collection
不同 metadata filter
不同 Prompt 模板
```

# 10. Query Construction：把问题变成搜索参数

这次新增的另一个重点模块是：

```text
src/rag_std/retrieval/query_construction.py
```

Query Translation 解决的是：

```text
怎么把问题改写得更适合向量检索？
```

Query Construction 解决的是：

```text
怎么把自然语言问题变成结构化搜索参数？
```

例如用户问：

```text
how to use multi-modal models in an agent, only videos under 5 minutes
```

期望构造结果是：

```python
{
    "content_search": "multi-modal models agent",
    "title_search": "multi-modal models agent",
    "max_length_sec": 300,
    "filters": {
        "media_type": "video"
    }
}
```

这和普通 query 改写不一样。

它不是生成更多自然语言 query，而是把问题拆成：

```text
要搜索什么内容？
标题里查什么？
有没有过滤条件？
有没有时长限制？
有没有 metadata 约束？
```

目前我定义了一个结构：

```python
@dataclass(frozen=True)
class ConstructedQuery:
    content_search: str
    title_search: str = ""
    max_length_sec: int | None = None
    min_length_sec: int | None = None
    filters: dict[str, str | int | float | bool] = field(default_factory=dict)
    reason: str = ""
```

这就是自然语言 question 到搜索参数之间的中间层。

# 11. Query Construction 的两种方式

`QueryConstructor` 目前支持两种方法：

```text
rule
prompt
```

规则版会做几件事：

```text
抽取英文关键词
抽取中文关键词
识别常见中文实体
解析 under 5 minutes / 5 分钟以内 这类时长条件
识别 videos -> media_type=video
```

为了适配当前《红楼梦》测试语料，我先加了一个很小的实体词表：

```text
红楼梦
林黛玉
贾宝玉
薛宝钗
王熙凤
刘姥姥
贾母
王夫人
贾府
荣国府
宁国府
大观园
金陵十二钗
黛玉葬花
判词
```

例如：

```text
林黛玉第一次进贾府时见到了哪些人？
```

规则版会构造出：

```python
{
    "content_search": "林黛玉 贾府 见到",
    "title_search": "林黛玉 贾府 见到"
}
```

prompt 版则会调用大模型，要求模型按 schema 返回 JSON。这里的好处是更灵活，缺点是需要依赖模型输出稳定性，所以我也保留了 rule 作为兜底。

# 12. Query Construction 如何接入 SQLite

Query Construction 不是只打印结构化结果，它还接到了 SQLite chunks 检索。

现在 pipeline 里有两个入口：

```python
construct_query(...)
search_chunks_by_constructed_query(...)
```

CLI 里可以这样测试：

```bash
uv run rag-std --query "林黛玉第一次进贾府时见到了哪些人？" --construct-query
```

输出会分两部分。

第一部分是结构化搜索参数：

```json
{
  "content_search": "林黛玉 贾府 见到",
  "title_search": "林黛玉 贾府 见到",
  "reason": "基于规则抽取关键词和时长过滤条件。"
}
```

第二部分是 SQLite 关键词检索结果：

```text
chunk_index=...
chars=...
preview=...
```

这一步还不是最终完整的结构化检索系统，但已经有了一个雏形：

```text
自然语言 question
  -> ConstructedQuery
  -> SQLite keyword search
  -> 候选 chunks
```

后续如果给 chunk 增加 metadata，比如：

```text
chapter
title
source_type
character
```

Query Construction 就可以真正生成 metadata filter，而不只是关键词。

# 13. 当前 pipeline 的样子

这版之后，整体链路可以写成：

```text
文档
  -> structure_semantic chunking
  -> 保存 chunks 到 SQLite
  -> embedding 文档向量化
  -> 写入 ChromaDB

用户问题
  -> 可选 Routing
  -> 可选 Query Construction
  -> 可选 Query Translation
  -> Retriever 检索
  -> RRF / ReRank
  -> Generator 回答
```

从代码角度看，`pipeline.py` 已经不只是简单地串：

```text
ingest -> retrieve -> generate
```

它开始变成一个小型编排层：

```text
ingest_file
  -> split_file
  -> SQLiteChunkStore.replace_chunks
  -> embed_documents
  -> ChromaVectorStore.add_chunks

construct_query
  -> QueryConstructor.construct

search_chunks_by_constructed_query
  -> SQLiteChunkStore.search_chunks

retrieve_context
  -> QueryRouter.route_for_request
  -> _retrieve_by_route
  -> reranker.rerank
```

这让我更明显地看到 RAG 的阶段边界：

```text
Indexing 不是只负责 embedding。
Retrieval 也不是只负责向量相似度。
```

两者之间还有很多结构化信息可以利用。

# 14. CLI 里如何测试

当前默认文档已经改成：

```text
data/红楼梦.txt
```

普通 RAG：

```bash
uv run rag-std --query "林黛玉第一次进贾府时见到了哪些人？"
```

查看数据源路由：

```bash
uv run rag-std --query "贾宝玉和林黛玉是什么关系？" --route-source --source-route-method rule
```

查看 Semantic Prompt 路由：

```bash
uv run rag-std --query "金陵十二钗判词有什么象征意义？" --route-prompt
```

查看 Query Construction：

```bash
uv run rag-std --query "林黛玉第一次进贾府时见到了哪些人？" --construct-query --query-construction-method rule
```

切块参数也可以调：

```bash
uv run rag-std --chunk-strategy structure_semantic --chunk-max-chars 1200
```

SQLite 默认保存位置是：

```text
data/chunks.sqlite3
```

如果不想保存切分结果，可以传：

```bash
uv run rag-std --chunk-db ""
```

# 15. 这次实现的不足

这版虽然前进了一大步，但还有不少明显不足。

第一，SQLite chunks 目前还是纯文本表。

虽然保存了切块参数，但还没有保存真正的章节 metadata。比如：

```text
chapter_number
chapter_title
scene_marker
source_type
```

后面应该把这些从 chunk 文本里提出来，单独作为字段。

第二，Query Construction 的规则版还很粗。

现在的中文关键词抽取更像“轻量规则 + 小词表”，不是真正的 NER。如果以后文档种类变多，应该考虑更稳定的实体识别方式。

第三，SQLite 关键词检索还只是教学版。

现在用的是 `LIKE` 和简单命中计分。后面可以考虑：

```text
SQLite FTS5
BM25
metadata filter
关键词检索 + 向量检索混合召回
```

第四，Routing 的数据源还只是抽象。

现在虽然能输出 `source_id`，但还没有真正把不同 source_id 映射到不同数据库、collection 或过滤条件。这一步要和 metadata 设计一起推进。

# 16. 我对这一阶段的理解

前三篇里，我更多关注的是：

```text
用户问题怎么变成更好的 query？
```

这篇开始，我更关注：

```text
文档怎么变成更好的可检索对象？
用户问题怎么变成更明确的搜索条件？
```

这两个问题其实是一体的。

如果 Indexing 阶段没有保留结构，那么 Query Construction 就算抽出了章节、标题、人物，也没有地方过滤。

如果 Query Construction 不能构造结构化条件，那么 Indexing 阶段保存再多 metadata，也很难用起来。

所以我现在对 RAG 的理解变成了：

```text
Indexing 决定资料如何被组织。
Retrieval 决定问题如何被表达。
Query Construction 是二者之间的桥。
```

这也解释了为什么这次要把 chunk 保存到 SQLite。它不是最终答案，但它让我能看见系统内部到底发生了什么。

# 17. 下一步计划

下一步我想沿着四个方向继续做。

第一，给 chunk 增加 metadata。

尤其是《红楼梦》这种结构很明显的文档，应该至少保存：

```text
chapter_number
chapter_title
chunk_index
source_path
```

第二，把 SQLite 检索升级成 FTS。

现在 `LIKE` 可以帮助理解 Query Construction，但不适合长期使用。FTS5 + BM25 会更接近真正的关键词检索。

第三，让 Query Construction 真正参与 Retrieval。

当前它主要是独立打印和搜索 SQLite chunks。后面可以考虑：

```text
Query Construction
  -> SQLite keyword search 召回一批候选
  -> Vector search 召回一批候选
  -> RRF 或 rerank 融合
```

也就是把关键词检索和向量检索做成混合检索。

第四，尝试处理纯图片 PDF。

现在 `data` 目录里还有一个 PDF 文件，它不是普通可复制文本，而是纯图片内容。这类文档不能直接用现在的 `read_text` 或普通文本 splitter 处理。

后面可以把它作为新的 Indexing 练习：

```text
纯图片 PDF
  -> 按页渲染成图片
  -> OCR 识别文字
  -> 清洗 OCR 结果
  -> 按页、标题或语义进行切分
  -> 保存到 SQLite
  -> embedding 后写入向量库
```

这个方向可以帮助我补上另一类真实文档场景：不是所有知识库资料一开始就是干净文本。很多扫描版 PDF、图片资料、老书影印件，都需要先经过 OCR，才有机会进入 RAG pipeline。

# 18. 小结

这一篇主要完成了三个方向：

```text
长文档 Indexing
  -> 从《红楼梦》开始测试真实长文本
  -> 实现结构优先的 Semantic Chunking
  -> 跳过目录，保留回目上下文

SQLite Chunk Store
  -> 保存切分后的 chunks
  -> 支持按构造出的关键词搜索 chunks

Query Construction
  -> 把自然语言 question 转成 content_search、title_search 和 filters
  -> 支持 rule 和 prompt 两种方式
```

如果说前三篇是在把 Retrieval 阶段的 query 处理能力补起来，那么这一篇更像是在补“可检索对象”和“结构化检索条件”。

RAG 的链路也因此从：

```text
文本 -> 向量 -> 检索 -> 回答
```

变成了更细的一层：

```text
文本结构
  -> chunk
  -> chunk store
  -> embedding
  -> query construction
  -> keyword search / vector search
  -> rerank
  -> answer
```

这一步让我感觉 RAG 开始从 Demo 进入“系统设计”的阶段了。不是功能一下子变复杂了，而是每个环节都开始有了可以继续优化的空间。
