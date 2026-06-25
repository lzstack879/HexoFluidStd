---
title: LeetCode Day 2：Trie、贪心、回溯与 LRU
date: 2026-06-25 11:47:55
categories:
  - 学习成长
tags:
  - LeetCode
  - Trie
  - 贪心
  - 回溯
  - LRU
  - Python
---

今天继续用 Codex 辅助规划和复盘 LeetCode 热题 100。Day 2 选择了 4 道更偏“系统能力”的题：

- **208. 实现 Trie（前缀树）**：练习高效前缀索引，和自动补全、命令匹配、知识检索都很接近。
- **45. 跳跃游戏 II**：练习用贪心思路在有限步数内逼近最优解。
- **79. 单词搜索**：练习 DFS + 回溯，在错误路径上及时撤回。
- **146. LRU 缓存**：练习缓存淘汰策略，在有限容量中保留最近真正有用的状态。

这 4 道题和 Agent 系统也有一些共通点：Trie 像检索入口，跳跃游戏像任务规划，单词搜索像多路径试探，LRU 像上下文和工具结果的缓存管理。刷题时不只是在写代码，也是在训练一种“如何组织状态、如何控制搜索、如何取舍资源”的思维。

<!-- more -->

# 208. 实现 Trie（前缀树）

Trie，也叫前缀树，是一种用于高效存储和检索字符串集合的树形数据结构。它常见于自动补全、拼写检查、关键词匹配等场景。

题目要求实现 `Trie` 类：

- `Trie()`：初始化前缀树对象。
- `insert(word)`：向前缀树中插入字符串 `word`。
- `search(word)`：判断完整字符串 `word` 是否已经插入。
- `startsWith(prefix)`：判断是否存在某个已插入字符串以 `prefix` 为前缀。

## 示例

```text
输入：
["Trie", "insert", "search", "search", "startsWith", "insert", "search"]
[[], ["apple"], ["apple"], ["app"], ["app"], ["app"], ["app"]]

输出：
[null, null, true, false, true, null, true]
```

解释：

```python
trie = Trie()
trie.insert("apple")
trie.search("apple")    # True
trie.search("app")      # False
trie.startsWith("app")  # True
trie.insert("app")
trie.search("app")      # True
```

## 解题思路

可以把 Trie 理解成“把单词按字符拆开后，挂到同一棵树上”。相同前缀会共享同一段路径，不同后缀再从分叉处继续延伸。

每个节点需要两个信息：

- `children`：从当前字符通向后续字符的映射。
- `is_end`：当前节点是否代表一个完整单词的结尾。

插入 `app` 时，结构大致如下：

```text
root
└── a
    └── p
        └── p  ← "app" 结束
```

`search` 和 `startsWith` 都会从根节点沿着字符路径向下走。区别在于：

- `search(word)` 不只要求路径存在，还要求最后一个节点的 `is_end` 为 `True`。
- `startsWith(prefix)` 只要求前缀路径存在，不关心最后节点是否是完整单词结尾。

## 代码

```python
class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False


class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word: str) -> None:
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.is_end = True

    def search(self, word: str) -> bool:
        node = self.root
        for ch in word:
            if ch not in node.children:
                return False
            node = node.children[ch]
        return node.is_end

    def startsWith(self, prefix: str) -> bool:
        node = self.root
        for ch in prefix:
            if ch not in node.children:
                return False
            node = node.children[ch]
        return True
```

## 复杂度

- 时间复杂度：`insert`、`search`、`startsWith` 都是 `O(L)`，其中 `L` 是字符串长度。
- 空间复杂度：`O(S)`，其中 `S` 是所有插入字符串的字符总数。共享前缀会减少实际节点数量。

# 45. 跳跃游戏 II

给定一个长度为 `n` 的 0 索引整数数组 `nums`。初始位置在下标 `0`，`nums[i]` 表示从下标 `i` 向后最多可以跳多少步。题目保证一定可以到达最后一个下标。

返回到达下标 `n - 1` 所需的最少跳跃次数。

## 示例

```text
输入：nums = [2,3,1,1,4]
输出：2
解释：先从下标 0 跳到下标 1，再从下标 1 跳到最后一个位置。
```

```text
输入：nums = [2,3,0,1,4]
输出：2
```

## 解题思路

这道题可以用贪心解决，也可以把过程理解成一次“隐式 BFS”：

- 当前跳跃次数能覆盖一个范围。
- 在这个范围里继续扫描，计算下一跳最远能到哪里。
- 当扫描到当前范围的边界时，说明必须再跳一次，于是更新边界。

核心变量有两个：

- `current_end`：当前跳跃次数能到达的最远边界。
- `farthest`：在当前边界内继续向外扩展后，下一跳能到达的最远位置。

扫描过程中，每当 `i == current_end`，就说明当前这一层已经走完，需要把跳跃次数加一，并把边界更新为 `farthest`。

## 代码

```python
from typing import List


class Solution:
    def jump(self, nums: List[int]) -> int:
        n = len(nums)
        if n <= 1:
            return 0

        jumps = 0
        current_end = 0
        farthest = 0

        for i in range(n - 1):
            farthest = max(farthest, i + nums[i])

            if i == current_end:
                jumps += 1
                current_end = farthest

                if current_end >= n - 1:
                    break

        return jumps
```

## 复杂度

- 时间复杂度：`O(n)`，只需要线性扫描一次。
- 空间复杂度：`O(1)`。

# 79. 单词搜索

给定一个 `m x n` 的字符网格 `board` 和一个字符串 `word`。如果 `word` 能按顺序由相邻单元格中的字母组成，则返回 `True`；否则返回 `False`。

相邻单元格指水平或垂直相邻。同一个单元格不能被重复使用。

```text
A B C E
S F C S
A D E E
```

## 示例

```text
输入：board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], word = "ABCCED"
输出：true
```

```text
输入：board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], word = "SEE"
输出：true
```

```text
输入：board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], word = "ABCB"
输出：false
```

## 解题思路

这是一道典型的 DFS + 回溯题。

从网格中的每一个位置出发，尝试匹配 `word[0]`。如果当前字符匹配，就临时标记该格子为已访问，再向上下左右四个方向继续匹配下一个字符。

回溯的关键是：递归结束后要恢复现场。也就是说，当前路径试完以后，需要把格子的原字符放回去，让其他路径还能继续使用它。

整个过程可以拆成几步：

1. 遍历每一个格子，寻找可能的起点。
2. 从起点开始 DFS，逐个匹配 `word[k]`。
3. 越界、字符不匹配、访问到已用格子时返回 `False`。
4. 匹配完整个单词时返回 `True`。
5. 每次 DFS 返回前恢复当前格子的字符。

## 代码

```python
from typing import List


class Solution:
    def exist(self, board: List[List[str]], word: str) -> bool:
        m, n = len(board), len(board[0])

        def dfs(i: int, j: int, k: int) -> bool:
            if k == len(word):
                return True

            if i < 0 or i >= m or j < 0 or j >= n:
                return False

            if board[i][j] != word[k]:
                return False

            current = board[i][j]
            board[i][j] = "#"

            found = (
                dfs(i + 1, j, k + 1)
                or dfs(i - 1, j, k + 1)
                or dfs(i, j + 1, k + 1)
                or dfs(i, j - 1, k + 1)
            )

            board[i][j] = current
            return found

        for i in range(m):
            for j in range(n):
                if dfs(i, j, 0):
                    return True

        return False
```

## 复杂度

- 时间复杂度：最坏情况下约为 `O(m * n * 3^L)`，其中 `L` 是 `word` 的长度。第一步有 `m * n` 个起点，后续每一步通常最多尝试 3 个新方向。
- 空间复杂度：`O(L)`，主要来自递归调用栈。

# 146. LRU 缓存

请设计并实现一个满足 LRU（Least Recently Used，最近最少使用）策略的缓存。

需要实现 `LRUCache` 类：

- `LRUCache(capacity)`：用正整数容量 `capacity` 初始化缓存。
- `get(key)`：如果 `key` 存在，返回对应值，并把它标记为最近使用；否则返回 `-1`。
- `put(key, value)`：插入或更新键值。如果容量超出限制，淘汰最近最少使用的键。

要求 `get` 和 `put` 的平均时间复杂度都是 `O(1)`。

## 示例

```text
输入：
["LRUCache", "put", "put", "get", "put", "get", "put", "get", "get", "get"]
[[2], [1, 1], [2, 2], [1], [3, 3], [2], [4, 4], [1], [3], [4]]

输出：
[null, null, null, 1, null, -1, null, -1, 3, 4]
```

解释：

```python
lru = LRUCache(2)
lru.put(1, 1)  # {1=1}
lru.put(2, 2)  # {1=1, 2=2}
lru.get(1)     # 返回 1，此时 1 变成最近使用
lru.put(3, 3)  # 淘汰 2
lru.get(2)     # 返回 -1
lru.put(4, 4)  # 淘汰 1
lru.get(1)     # 返回 -1
lru.get(3)     # 返回 3
lru.get(4)     # 返回 4
```

## 解题思路

LRU 的核心规则是：最近用过的保留，最久没用的淘汰。

在 Python 里可以直接使用 `collections.OrderedDict`。它既能像字典一样通过 key 快速访问，又能维护元素顺序。

这里约定：

- 左侧：最久未使用。
- 右侧：最近使用。

因此：

- `get(key)`：如果不存在，返回 `-1`；如果存在，把 key 移到最右侧，然后返回 value。
- `put(key, value)`：如果 key 已存在，先移到最右侧，再更新 value；如果插入后超出容量，就从左侧弹出最久未使用的元素。

## 代码

```python
from collections import OrderedDict


class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = OrderedDict()

    def get(self, key: int) -> int:
        if key not in self.cache:
            return -1

        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key: int, value: int) -> None:
        if key in self.cache:
            self.cache.move_to_end(key)

        self.cache[key] = value

        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)
```

## 复杂度

- 时间复杂度：`get` 和 `put` 都是 `O(1)`。
- 空间复杂度：`O(capacity)`。

# 今日小结

今天这 4 道题覆盖了几种很重要的能力：

- **Trie**：把字符串组织成可共享前缀的索引结构。
- **贪心**：每一步都维护当前能到达的最远边界。
- **回溯**：试探、标记、撤回，保持搜索路径干净。
- **LRU**：在有限容量中决定什么应该留下，什么应该被淘汰。

继续刷题时，我会刻意多问自己两个问题：

1. 当前题目里，什么是“状态”？
2. 状态之间应该如何转移、剪枝或淘汰？

能把这两个问题想清楚，代码通常就会安静很多，也可靠很多。
