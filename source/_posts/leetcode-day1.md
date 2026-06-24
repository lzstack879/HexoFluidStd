---
title: LeetCode Day 1：动态规划与图论入门
date: 2026-06-24 10:44:04
categories:
  - 学习成长
tags:
  - LeetCode
  - 动态规划
  - BFS
  - 拓扑排序
  - Python
---

今天开始用 Codex 辅助规划和复盘 LeetCode 热题 100。Day 1 先刷 4 道基础但很有代表性的题：

- **1. 最小路径和**：动态规划、网格路径、最小代价决策。
- **2. 单词拆分**：动态规划、字符串、状态复用、剪枝。
- **3. 腐烂的橘子**：广度优先搜索、多源 BFS、按时间层级扩散。
- **4. 课程表**：图、拓扑排序、有向图环检测、依赖管理。

这 4 道题和 Agent 系统也有一点共通之处：路径选择像规划，单词拆分像任务拆解，腐烂的橘子像状态传播，课程表像依赖调度。它们不只是算法题，也是在练习“如何把复杂问题拆成可验证的状态转移”。

<!-- more -->

# 1. 最小路径和

给定一个包含非负整数的 `m x n` 网格 `grid`，请找出一条从左上角到右下角的路径，使路径上的数字总和最小。

说明：每次只能向下或者向右移动一步。

## 示例

示例 1：

| 1 | 3 | 1 |
|---|---|---|
| 1 | 5 | 1 |
| 4 | 2 | 1 |

**输入：** `grid = [[1,3,1],[1,5,1],[4,2,1]]`  
**输出：** `7`  
**解释：** 路径 `1 → 3 → 1 → 1 → 1` 的总和最小。

示例 2：

**输入：** `grid = [[1,2,3],[4,5,6]]`  
**输出：** `12`

## 解题思路

这是一道经典动态规划题。定义：

```text
dp[i][j] 表示从起点走到 grid[i][j] 的最小路径和
```

状态转移：

```text
起点：dp[0][0] = grid[0][0]
第一行：dp[0][j] = dp[0][j - 1] + grid[0][j]
第一列：dp[i][0] = dp[i - 1][0] + grid[i][0]
其他位置：dp[i][j] = min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j]
```

最终答案是：

```text
dp[m - 1][n - 1]
```

进一步观察可以发现，当前位置只依赖“上方”和“左方”的结果，不需要保存完整二维数组。因此可以用一维滚动数组优化空间。

## 代码

```python
from typing import List


class Solution:
    def minPathSum(self, grid: List[List[int]]) -> int:
        if not grid or not grid[0]:
            return 0

        m, n = len(grid), len(grid[0])
        dp = [0] * n

        for i in range(m):
            for j in range(n):
                if i == 0 and j == 0:
                    dp[j] = grid[i][j]
                elif i == 0:
                    dp[j] = dp[j - 1] + grid[i][j]
                elif j == 0:
                    dp[j] = dp[j] + grid[i][j]
                else:
                    dp[j] = min(dp[j], dp[j - 1]) + grid[i][j]

        return dp[-1]
```

## 复杂度

- 时间复杂度：`O(m * n)`
- 空间复杂度：`O(n)`

# 2. 单词拆分

给你一个字符串 `s` 和一个字符串列表 `wordDict` 作为字典。如果可以利用字典中出现的一个或多个单词拼接出 `s`，则返回 `true`。

注意：字典中的单词可以重复使用。

## 示例

示例 1：

**输入：** `s = "leetcode", wordDict = ["leet", "code"]`  
**输出：** `true`  
**解释：** `"leetcode"` 可以由 `"leet"` 和 `"code"` 拼接而成。

示例 2：

**输入：** `s = "applepenapple", wordDict = ["apple", "pen"]`  
**输出：** `true`  
**解释：** `"applepenapple"` 可以由 `"apple" + "pen" + "apple"` 拼接而成。

示例 3：

**输入：** `s = "catsandog", wordDict = ["cats", "dog", "sand", "and", "cat"]`  
**输出：** `false`

## 解题思路

定义：

```text
dp[i] 表示字符串 s 的前 i 个字符，也就是 s[0:i]，能否被成功拆分
```

初始化：

```text
dp[0] = True
```

空字符串可以被认为已经完成拆分。

状态转移：

```text
如果 dp[j] == True 且 s[j:i] 在 wordDict 中，
那么 dp[i] = True
```

为了减少无效枚举，可以只枚举字典中出现过的单词长度，而不是枚举所有 `j`。

## 代码

```python
from typing import List


class Solution:
    def wordBreak(self, s: str, wordDict: List[str]) -> bool:
        word_set = set(wordDict)
        word_lens = set(len(word) for word in wordDict)

        n = len(s)
        dp = [False] * (n + 1)
        dp[0] = True

        for i in range(1, n + 1):
            for length in word_lens:
                j = i - length
                if j >= 0 and dp[j] and s[j:i] in word_set:
                    dp[i] = True
                    break

        return dp[n]
```

## 复杂度

- 时间复杂度：约 `O(n * k * L)`，其中 `k` 是不同单词长度数量，`L` 是切片匹配成本。
- 空间复杂度：`O(n + len(wordDict))`

# 3. 腐烂的橘子

在给定的 `m x n` 网格 `grid` 中，每个单元格有三种可能：

- `0`：空单元格
- `1`：新鲜橘子
- `2`：腐烂的橘子

每分钟，腐烂橘子会让上下左右 4 个方向相邻的新鲜橘子腐烂。返回直到没有新鲜橘子为止所需的最少分钟数；如果不可能，返回 `-1`。

## 示例

示例 1：

![腐烂的橘子扩散过程](/images/leetcode/oranges.png)

**输入：** `grid = [[2,1,1],[1,1,0],[0,1,1]]`  
**输出：** `4`

示例 2：

**输入：** `grid = [[2,1,1],[0,1,1],[1,0,1]]`  
**输出：** `-1`  
**解释：** 左下角的橘子永远不会腐烂，因为腐烂只能发生在上下左右 4 个方向。

示例 3：

**输入：** `grid = [[0,2]]`  
**输出：** `0`  
**解释：** 一开始就没有新鲜橘子，所以答案是 `0`。

## 解题思路

这是一道典型的多源 BFS。

先遍历网格：

- 统计新鲜橘子数量 `fresh`。
- 将所有腐烂橘子的坐标加入队列 `queue`，作为 BFS 第 0 层。

然后按分钟扩散：

- 队列中当前已有的腐烂橘子，会在这一分钟同时向外扩散。
- 每感染一个新鲜橘子，就将它改成 `2`，并加入队列，等待下一分钟继续扩散。
- 每完成一层 BFS，`minutes += 1`。

如果最后 `fresh == 0`，说明所有橘子都腐烂了；否则说明有新鲜橘子被空格隔开，永远无法腐烂。

## 关键代码解释

```python
while queue and fresh > 0:
    for _ in range(len(queue)):
        ...
    minutes += 1
```

这里的 `len(queue)` 非常关键。它固定了当前这一分钟要处理的腐烂橘子数量。循环中新增的腐烂橘子会进入队列，但不会在当前分钟继续扩散，而是留到下一分钟。

也就是说：

```text
while 的一轮 = 过去 1 分钟
for 的一层 = 当前分钟内所有会扩散的腐烂橘子
```

## 代码

```python
from typing import List
from collections import deque


class Solution:
    def orangesRotting(self, grid: List[List[int]]) -> int:
        m, n = len(grid), len(grid[0])
        fresh = 0
        queue = deque()

        for i in range(m):
            for j in range(n):
                if grid[i][j] == 1:
                    fresh += 1
                elif grid[i][j] == 2:
                    queue.append((i, j))

        if fresh == 0:
            return 0

        minutes = 0
        directions = [(1, 0), (-1, 0), (0, 1), (0, -1)]

        while queue and fresh > 0:
            for _ in range(len(queue)):
                x, y = queue.popleft()

                for dx, dy in directions:
                    nx, ny = x + dx, y + dy

                    if 0 <= nx < m and 0 <= ny < n and grid[nx][ny] == 1:
                        grid[nx][ny] = 2
                        fresh -= 1
                        queue.append((nx, ny))

            minutes += 1

        return minutes if fresh == 0 else -1
```

## 复杂度

- 时间复杂度：`O(m * n)`
- 空间复杂度：`O(m * n)`

# 4. 课程表

你这个学期必须选修 `numCourses` 门课程，课程编号为 `0` 到 `numCourses - 1`。

有些课程需要先修课。先修关系由 `prerequisites` 给出，其中：

```text
prerequisites[i] = [ai, bi]
```

表示如果要学习课程 `ai`，必须先学习课程 `bi`。

请判断是否可以完成所有课程。如果可以，返回 `true`；否则返回 `false`。

## 示例

示例 1：

**输入：** `numCourses = 2, prerequisites = [[1,0]]`  
**输出：** `true`  
**解释：** 学习课程 `1` 之前，需要先完成课程 `0`，这是可以做到的。

示例 2：

**输入：** `numCourses = 2, prerequisites = [[1,0],[0,1]]`  
**输出：** `false`  
**解释：** 学 `1` 要先学 `0`，学 `0` 又要先学 `1`，形成循环依赖。

## 解题思路

这道题本质上是判断有向图中是否存在环，可以使用 BFS 拓扑排序。

每个先修关系 `[a, b]` 表示：

```text
b -> a
```

也就是学完 `b` 之后，才可以学习 `a`。

算法步骤：

1. 构建邻接表 `graph`，记录每门课后面可以解锁哪些课程。
2. 构建入度数组 `indegree`，记录每门课还剩多少门先修课没学。
3. 将所有入度为 `0` 的课程加入队列。
4. 不断从队列中取出课程，表示学完这门课。
5. 学完一门课后，它指向的后续课程入度减 `1`。
6. 如果某门后续课程入度变成 `0`，说明它可以学习了，加入队列。
7. 最后判断学完的课程数量是否等于 `numCourses`。

## 代码

```python
from typing import List
from collections import deque


class Solution:
    def canFinish(self, numCourses: int, prerequisites: List[List[int]]) -> bool:
        graph = [[] for _ in range(numCourses)]
        indegree = [0] * numCourses

        for a, b in prerequisites:
            graph[b].append(a)
            indegree[a] += 1

        queue = deque(i for i in range(numCourses) if indegree[i] == 0)

        learned = 0
        while queue:
            course = queue.popleft()
            learned += 1

            for next_course in graph[course]:
                indegree[next_course] -= 1
                if indegree[next_course] == 0:
                    queue.append(next_course)

        return learned == numCourses
```

## 复杂度

- 时间复杂度：`O(numCourses + len(prerequisites))`
- 空间复杂度：`O(numCourses + len(prerequisites))`

# 今日小结

今天这 4 道题可以归成两类：

- **动态规划**：最小路径和、单词拆分。
- **图搜索 / 图排序**：腐烂的橘子、课程表。

动态规划的重点是定义状态和状态转移；图题的重点是建模节点、边和遍历顺序。后面继续刷题时，我会优先关注这两个问题：

1. 当前题目里，什么是“状态”？
2. 状态之间如何安全、无重复地转移？

能把这两个问题想清楚，代码通常就会自然很多。
