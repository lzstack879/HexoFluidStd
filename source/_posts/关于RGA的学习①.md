---
title: 关于 RAG 的学习①：从一个最小 Demo 看懂基础架构
date: 2026-06-18 09:12:15
categories:
  - 学习成长
tags:
  - RAG
  - 大模型
  - 向量数据库
  - ChromaDB
  - DashScope
---

这篇是我学习 RAG 的第一篇笔记。

之前文件名里写成了 `RGA`，但这里真正要学习的是 `RAG`，也就是 **Retrieval-Augmented Generation，检索增强生成**。

我这次看的 Demo 很小，但链路是完整的：从一个本地文档开始，切成片段，转成向量，存入向量数据库，再根据问题检索相关片段，最后把片段交给大模型生成回答。

对我来说，这个 Demo 的价值不是“功能多强”，而是它把 RAG 最基础的骨架露出来了。

对应的学习仓库已经整理到 GitHub：

[RAG_Std](https://github.com/lz17616241962-ops/RAG_Std)

<!-- more -->

# 1. RAG 要解决什么问题

普通大模型直接回答问题时，主要有两个限制：

- 它不知道我本地文档里的内容。
- 它可能会在缺少依据时编造答案。

RAG 的思路是：**先从知识库里找资料，再让大模型基于资料回答。**

所以它不是让模型凭空记住所有知识，而是在回答前临时给模型补充上下文。

可以简单理解成：

```text
用户问题
  -> 去知识库检索相关资料
  -> 把资料和问题一起交给大模型
  -> 大模型基于资料生成答案
```

这也是我现在理解 RAG 的第一层含义：**生成不是起点，检索才是起点。**

# 2. 这个 Demo 的整体架构

根据 `demo.ipynb`，最基础的 RAG 流程可以拆成 6 个步骤：

```text
原始文档 doc.md
  -> 文档切块 Chunking
  -> 向量化 Embedding
  -> 存入向量数据库 ChromaDB
  -> 根据问题向量检索 Retrieve
  -> 对候选片段重排 Rerank
  -> 拼接 Prompt 并调用大模型 Generate
```

换成更贴近代码的结构：

```text
split_into_chunks()
  -> embed_chunk()
  -> save_embeddings()
  -> retrieve()
  -> rerank()
  -> generate()
```

这几个函数刚好对应了一个最小 RAG 系统的核心模块。

# 3. 模块一：文档切块

Demo 里第一步是读取 `doc.md`，然后用空行把文档切成多个 chunk。

```python
from typing import List


def split_into_chunks(doc_file: str) -> List[str]:
    with open(doc_file, "r", encoding="utf-8") as f:
        content = f.read()

    return [chunk for chunk in content.split("\n\n")]


chunks = split_into_chunks("doc.md")
```

这里的切块方式很简单：

```text
按照两个换行符 \n\n 分割
```

也就是说，每个自然段大致会变成一个 chunk。

我现在的理解是：切块是 RAG 的第一道地基。切得太大，检索不够精确；切得太小，上下文可能不完整。

这个 Demo 用空行切块，适合入门理解。但如果之后做正式项目，可能需要考虑：

- 按标题层级切分
- 按 token 长度切分
- 设置 chunk overlap
- 保留来源、页码、标题等 metadata

最小版本先不要复杂化。先知道：**RAG 检索的基本单位不是整篇文档，而是 chunk。**

# 4. 模块二：Embedding 向量化

切好的文本只是普通字符串，向量数据库不能直接理解它们的语义。

所以第二步要把文本转成向量。

Demo 使用的是 DashScope 的 embedding 模型：

```python
import os
import numpy as np
import dashscope
from http import HTTPStatus
from typing import List


api_key = os.environ["DASHSCOPE_API_KEY"]
MODEL = "text-embedding-v4"
DIMENSION = 1024
```

核心函数是：

```python
def l2_normalize(vector: List[float]) -> List[float]:
    arr = np.array(vector, dtype=np.float32)
    norm = np.linalg.norm(arr)

    if norm == 0.0:
        return arr.tolist()

    return (arr / norm).tolist()


def embed_chunk(chunk: str) -> List[float]:
    resp = dashscope.TextEmbedding.call(
        model=MODEL,
        api_key=api_key,
        input=chunk,
        dimension=DIMENSION,
        text_type="document",
    )

    if resp.status_code != HTTPStatus.OK:
        raise RuntimeError(
            f"Embedding failed: status_code={resp.status_code}, "
            f"code={resp.code}, message={resp.message}"
        )

    embedding = resp.output["embeddings"][0]["embedding"]
    return l2_normalize(embedding)
```

这里我重点记住两件事：

1. `text-embedding-v4` 把文本变成了一个 1024 维向量。
2. `l2_normalize` 把向量归一化，方便后续做相似度比较。

Embedding 的作用可以理解为：把文本放到一个语义空间里。

意思相近的文本，在这个空间里的距离会更近；意思不相关的文本，距离会更远。

然后批量处理所有 chunk：

```python
embeddings = [embed_chunk(chunk) for chunk in chunks]
```

到这一步，文档已经从“自然语言”变成了“可检索的向量”。

# 5. 模块三：存入向量数据库

Demo 使用 ChromaDB 作为向量数据库。

```python
import chromadb


chromadb_client = chromadb.EphemeralClient()
chromadb_collection = chromadb_client.get_or_create_collection(name="default")
```

这里用的是 `EphemeralClient`，也就是临时客户端。它适合 Demo 和实验，程序结束后数据不会长期保存。

保存向量的函数：

```python
def save_embeddings(chunks: List[str], embeddings: List[List[float]]) -> None:
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        chromadb_collection.add(
            documents=[chunk],
            embeddings=[embedding],
            ids=[str(i)],
        )


save_embeddings(chunks, embeddings)
```

每条数据包含三部分：

```text
id         -> chunk 的编号
document   -> chunk 原文
embedding  -> chunk 对应的向量
```

这一步之后，知识库就有了最基础的样子。

不过要注意：Demo 里还没有保存 metadata。如果以后做企业知识库，metadata 很重要，例如：

- 文档名
- 页面号
- 章节标题
- 创建时间
- 权限范围
- 原始链接

因为用户不只需要答案，也需要知道答案来自哪里。

# 6. 模块四：根据问题检索

当用户提出问题时，系统不是立刻让大模型回答，而是先检索。

Demo 里的问题是：

```python
query = "皮卡丘使用了什么技能？"
```

检索函数：

```python
def retrieve(query: str, top_k: int) -> List[str]:
    query_embedding = embed_chunk(query)
    results = chromadb_collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
    )
    return results["documents"][0]


retrieved_chunks = retrieve(query, 5)
```

这里发生了三件事：

1. 把用户问题也转成 embedding。
2. 用问题向量去 ChromaDB 里找最相似的 chunk。
3. 返回前 `top_k` 个候选片段。

这一步就是 RAG 里的 `Retrieval`。

我对它的理解是：**检索质量决定了回答上限。**

如果召回的片段不相关，后面的大模型再强，也只能基于错误上下文回答。RAG 里很多优化，本质上都是在提升“找资料”的质量。

# 7. 模块五：Rerank 重排

向量检索会先找出一批候选片段，但这些片段的排序不一定最适合最终回答。

所以 Demo 又加了一步 rerank：

```python
def rerank(query: str, retrieved_chunks: List[str], top_k: int) -> List[str]:
    resp = dashscope.TextReRank.call(
        model="qwen3-rerank",
        query=query,
        documents=retrieved_chunks,
        top_n=top_k,
        return_documents=False,
        instruct="根据用户问题，从候选文本中找出最能回答问题的相关段落。",
    )

    if resp.status_code != HTTPStatus.OK:
        raise RuntimeError(
            f"Rerank failed: code={resp.code}, message={resp.message}"
        )

    results = resp.output["results"]

    reranked_chunks = [
        retrieved_chunks[item["index"]]
        for item in results
    ]

    return reranked_chunks


reranked_chunks = rerank(query, retrieved_chunks, 3)
```

我现在把它理解成两层筛选：

```text
向量检索 retrieve：先粗略找出可能相关的 5 个片段
重排 rerank：再从 5 个里面挑出最适合回答的 3 个片段
```

这一步不是最小 RAG 必须有的，但很常见。

尤其是当文档数量变多、chunk 变多时，单纯依赖向量相似度可能会出现“看起来相关，但答不上问题”的情况。Rerank 就是在召回之后再做一次更细的判断。

# 8. 模块六：拼接 Prompt 并生成回答

最后一步才是调用大模型。

Demo 把 rerank 后的 chunk 拼成上下文：

```python
context = "\n\n".join(chunks)
```

然后构造 prompt：

```python
prompt = f"""你是一位知识助手，请根据用户的问题和下列片段生成准确的回答。

用户问题: {query}

相关片段:
{context}

请基于上述内容作答，不要编造信息。"""
```

再调用 Qwen：

```python
response = dashscope.Generation.call(
    model="qwen-turbo",
    api_key=api_key,
    messages=[
        {
            "role": "system",
            "content": "你是一位知识助手，请严格基于给定片段回答问题，不要编造信息。"
        },
        {
            "role": "user",
            "content": prompt
        }
    ],
    result_format="message",
)
```

这一步就是 `Generation`。

这里的关键不只是“调用模型”，而是约束模型：

```text
请严格基于给定片段回答问题，不要编造信息。
```

这是 RAG 相比普通问答很重要的地方。我们不是只让模型“会说”，而是让它“有依据地说”。

# 9. 最基础 RAG 架构大纲

整理下来，一个最小 RAG 项目可以分成两条链路。

第一条是离线建库链路：

```text
文档加载
  -> 文档清洗
  -> 文档切块
  -> 生成 embedding
  -> 写入向量数据库
```

第二条是在线问答链路：

```text
用户问题
  -> 问题 embedding
  -> 向量检索
  -> 可选 rerank
  -> 拼接上下文
  -> 调用大模型
  -> 返回答案
```

如果用项目模块来表示，可以先设计成这样：

```text
rag-demo/
  data/
    doc.md
  rag/
    loader.py       # 读取文档
    splitter.py     # 文档切块
    embedding.py    # 文本向量化
    vector_store.py # 存储和检索
    reranker.py     # 候选片段重排
    generator.py    # 组织 Prompt 并生成答案
  app.py            # 串起完整流程
```

我已经把这个最小 Demo 整理成一个更适合继续扩展的仓库：

[https://github.com/lz17616241962-ops/RAG_Std](https://github.com/lz17616241962-ops/RAG_Std)

先不要急着加太多功能。

只要能把下面这条线跑通，就已经是一个完整的最小 RAG：

```text
doc.md -> chunks -> embeddings -> vector db -> query -> retrieved context -> answer
```

# 10. 我对 RAG 的阶段性理解

这次学习之后，我对 RAG 有了一个更朴素的认识。

RAG 不是单纯“调用大模型 + 查资料”。它更像一个管道系统：

- 切块决定资料的颗粒度。
- Embedding 决定语义表示的质量。
- 向量数据库决定资料能不能被快速找到。
- Retrieve 决定候选上下文是否相关。
- Rerank 决定最终上下文是否足够精准。
- Prompt 决定模型是否能按资料回答。

所以一个 RAG 系统的好坏，不只取决于最后的大模型，也取决于前面每一层是否干净。

现在这个 Demo 还很小，但它已经让我看到一条清楚的学习路线：

1. 先理解最小闭环。
2. 再替换更真实的文档加载方式，比如 PDF、Word、网页。
3. 再优化 chunk 策略和 metadata。
4. 再比较不同 embedding 模型和向量数据库。
5. 最后再加入引用、权限、评测和部署。

对我来说，第一阶段不追求复杂，而是先把这条链路亲手走通。只要这条链路稳了，后面的企业知识库、个人知识库、智能问答系统，才有地方继续生长。

# 11. 下一步计划

这个系列后面准备从这个最小 Demo 出发，逐步补全一条更完整的 RAG pipeline。

大致架构路线如下：

```text
最小 RAG Demo
  -> Query Translation
  -> Routing
  -> Query Construction
  -> Indexing
  -> Retrieval
  -> Generation
```

在基础链路跑通之后，再继续扩展几个增强模块：

```text
向量索引优化
  -> ReRank
  -> Long Context
```

最后再做更高阶方向的了解和展望：

```text
GraphRAG
  -> Agentic RAG
```

也就是说，第一阶段先把 RAG 当成一条清晰的管道来学习；后面再逐步理解它如何变成更复杂的知识组织系统和智能体工具链。
