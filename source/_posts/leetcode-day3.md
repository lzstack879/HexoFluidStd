---
title: LeetCode Day 3：链表、单调队列、区间合并与图搜索
date: 2026-06-26 09:49:35
categories:
  - 学习成长
tags:
  - LeetCode
  - 链表
  - 单调队列
  - 贪心
  - BFS
  - DFS
  - Python
---

今天继续用 Codex 辅助规划和复盘 LeetCode 热题 100。Day 3 选择了 4 道很适合巩固数据结构直觉的题：

- **23. 合并 K 个升序链表**：练习链表合并、分治归并，以及多路有序数据的汇聚。
- **239. 滑动窗口最大值**：练习单调队列，在固定窗口中持续维护最大值。
- **56. 合并区间**：练习排序与贪心，把重叠范围压缩成不冲突的结果。
- **200. 岛屿数量**：练习 DFS / BFS，在网格中发现完整的连通区域。

这 4 道题和 Agent 系统也有一些共通点：合并链表像多工具结果汇总，滑动窗口像上下文窗口管理，合并区间像任务时间段压缩，岛屿数量像在环境中识别可处理的工作区域。刷题时不只是记模板，也是在练习“如何维护状态、如何合并结果、如何避免重复访问”。

<!-- more -->

# 23. 合并 K 个升序链表

给你一个链表数组，每个链表都已经按升序排列。请将所有链表合并到一个升序链表中，并返回合并后的链表。

## 示例

示例 1：

```text
输入：lists = [[1,4,5],[1,3,4],[2,6]]
输出：[1,1,2,3,4,4,5,6]
解释：
[
  1 -> 4 -> 5,
  1 -> 3 -> 4,
  2 -> 6
]
合并后得到：
1 -> 1 -> 2 -> 3 -> 4 -> 4 -> 5 -> 6
```

示例 2：

```text
输入：lists = []
输出：[]
```

示例 3：

```text
输入：lists = [[]]
输出：[]
```

## 解题思路

这道题要求把 `k` 个已经有序的链表合并成一个新的有序链表。

一个直接的思路是顺序合并：先合并第 1 个和第 2 个，再把结果和第 3 个合并，依次继续。但这样前面已经合并出的长链表会被反复遍历，效率不够理想。

更好的做法是使用类似归并排序的分治思想：两两合并，逐轮扩大合并范围。

例如有 4 个链表：

```text
L0, L1, L2, L3
```

第一轮合并：

```text
L0 + L1
L2 + L3
```

第二轮合并：

```text
(L0 + L1) + (L2 + L3)
```

最后得到完整的有序链表。

合并两个链表时，可以用一个虚拟头节点 `dummy`。它不属于最终答案，只是为了让头节点和后续节点使用同一套连接逻辑。

```python
dummy = ListNode(0)
cur = dummy
```

其中 `cur` 始终指向当前已经合并链表的尾部。每次比较 `l1.val` 和 `l2.val`，把更小的节点接到 `cur.next`，然后移动对应链表指针和 `cur` 指针。

## 代码

```python
from typing import List, Optional


# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
#         self.next = next
class Solution:
    def mergeKLists(self, lists: List[Optional[ListNode]]) -> Optional[ListNode]:
        if not lists:
            return None

        def merge_two(l1: Optional[ListNode], l2: Optional[ListNode]) -> Optional[ListNode]:
            dummy = ListNode(0)
            cur = dummy

            while l1 and l2:
                if l1.val < l2.val:
                    cur.next = l1
                    l1 = l1.next
                else:
                    cur.next = l2
                    l2 = l2.next
                cur = cur.next

            cur.next = l1 if l1 else l2
            return dummy.next

        n = len(lists)
        step = 1

        while step < n:
            for i in range(0, n - step, step * 2):
                lists[i] = merge_two(lists[i], lists[i + step])
            step *= 2

        return lists[0]
```

## 复杂度

- 时间复杂度：`O(N log k)`，其中 `N` 是所有链表节点总数，`k` 是链表数量。
- 空间复杂度：`O(1)`，代码复用了原链表节点，只额外使用了少量指针变量。

# 239. 滑动窗口最大值

给你一个整数数组 `nums`，有一个大小为 `k` 的滑动窗口从数组最左侧移动到最右侧。你只能看到滑动窗口内的 `k` 个数字，窗口每次向右移动一位。

请返回每个滑动窗口中的最大值。

## 示例

示例 1：

```text
输入：nums = [1,3,-1,-3,5,3,6,7], k = 3
输出：[3,3,5,5,6,7]
解释：
滑动窗口的位置                    最大值
-----------------------------    -----
[1  3 -1] -3  5  3  6  7          3
 1 [3 -1 -3]  5  3  6  7          3
 1  3 [-1 -3  5] 3  6  7          5
 1  3 -1 [-3  5  3] 6  7          5
 1  3 -1 -3 [5  3  6] 7           6
 1  3 -1 -3  5 [3  6  7]          7
```

示例 2：

```text
输入：nums = [1], k = 1
输出：[1]
```

## 解题思路

如果每次窗口滑动后都重新遍历窗口寻找最大值，时间复杂度会是 `O(n * k)`，当数组和窗口都比较大时会很慢。

更好的方法是使用单调队列。

队列里存放数组下标，并且保证这些下标对应的值从队首到队尾单调递减。这样，队首下标对应的元素就是当前窗口最大值。

每遍历一个新元素 `nums[i]`，需要做三件事：

1. 如果队首下标已经离开窗口，就将它弹出。
2. 如果队尾下标对应的值小于当前值，就不断弹出队尾，因为这些元素之后不可能成为窗口最大值。
3. 将当前下标加入队尾。当 `i >= k - 1` 时，开始记录答案。

## 代码

```python
from typing import List
from collections import deque


class Solution:
    def maxSlidingWindow(self, nums: List[int], k: int) -> List[int]:
        if not nums or k == 0:
            return []

        queue = deque()
        result = []

        for i, num in enumerate(nums):
            if queue and queue[0] <= i - k:
                queue.popleft()

            while queue and nums[queue[-1]] < num:
                queue.pop()

            queue.append(i)

            if i >= k - 1:
                result.append(nums[queue[0]])

        return result
```

## 复杂度

- 时间复杂度：`O(n)`，每个下标最多入队一次、出队一次。
- 空间复杂度：`O(k)`，队列最多保存一个窗口内的下标。

# 56. 合并区间

以数组 `intervals` 表示若干个区间的集合，其中单个区间为 `intervals[i] = [starti, endi]`。请合并所有重叠的区间，并返回一个不重叠的区间数组，使它恰好覆盖输入中的所有区间。

## 示例

示例 1：

```text
输入：intervals = [[1,3],[2,6],[8,10],[15,18]]
输出：[[1,6],[8,10],[15,18]]
解释：区间 [1,3] 和 [2,6] 重叠，将它们合并为 [1,6]。
```

示例 2：

```text
输入：intervals = [[1,4],[4,5]]
输出：[[1,5]]
解释：区间 [1,4] 和 [4,5] 可以视为重叠区间。
```

示例 3：

```text
输入：intervals = [[4,7],[1,4]]
输出：[[1,7]]
解释：排序后是 [1,4]、[4,7]，两者可以合并为 [1,7]。
```

## 解题思路

核心思路很直接：先按照区间起点排序，再从左到右扫描。

扫描过程中，只需要比较当前区间和结果数组里的最后一个区间：

- 如果当前区间的起点大于最后一个区间的终点，说明没有重叠，直接加入结果。
- 否则说明两个区间有交集，将最后一个区间的终点更新为二者终点的较大值。

这道题看起来不复杂，但它很适合作为区间类问题的基础模板。很多任务调度、时间窗口压缩、冲突消解问题，本质上都在做类似的事情。

## 代码

```python
from typing import List


class Solution:
    def merge(self, intervals: List[List[int]]) -> List[List[int]]:
        if not intervals:
            return []

        intervals.sort(key=lambda x: x[0])
        merged = [intervals[0]]

        for i in range(1, len(intervals)):
            cur_start, cur_end = intervals[i]
            prev_start, prev_end = merged[-1]

            if cur_start > prev_end:
                merged.append(intervals[i])
            else:
                merged[-1][1] = max(prev_end, cur_end)

        return merged
```

## 复杂度

- 时间复杂度：`O(n log n)`，主要来自排序。
- 空间复杂度：`O(log n)` 或 `O(n)`，取决于排序实现和是否把返回结果计入额外空间。

# 200. 岛屿数量

给你一个由 `'1'`（陆地）和 `'0'`（水）组成的二维网格，请计算网格中岛屿的数量。

岛屿总是被水包围，并且每座岛屿只能由水平方向或竖直方向上相邻的陆地连接形成。你可以假设网格的四条边都被水包围。

## 示例

示例 1：

```text
输入：grid = [
  ["1","1","1","1","0"],
  ["1","1","0","1","0"],
  ["1","1","0","0","0"],
  ["0","0","0","0","0"]
]
输出：1
```

示例 2：

```text
输入：grid = [
  ["1","1","0","0","0"],
  ["1","1","0","0","0"],
  ["0","0","1","0","0"],
  ["0","0","0","1","1"]
]
输出：3
```

## 解题思路

这题和 Day 1 的“腐烂的橘子”有点像，都是在二维网格中做搜索。

核心思路是：遍历整个网格，每当遇到一块陆地 `'1'`，就说明发现了一座新的岛屿，计数加 1。然后从这块陆地出发，用 BFS 或 DFS 把与它连通的所有陆地都标记为 `'0'`，避免后续重复计数。

BFS 和 DFS 都可以解决：

- **BFS**：使用队列，一层一层向外扩展。
- **DFS**：使用递归，一条路径尽量走到底，代码更短。

需要注意的是，两种写法的最坏空间复杂度都可能达到 `O(m * n)`。DFS 的额外空间主要来自递归调用栈，BFS 的额外空间主要来自队列。

## BFS 代码

```python
from typing import List
from collections import deque


class Solution:
    def numIslands(self, grid: List[List[str]]) -> int:
        if not grid or not grid[0]:
            return 0

        m, n = len(grid), len(grid[0])
        count = 0
        directions = [(1, 0), (-1, 0), (0, 1), (0, -1)]

        for i in range(m):
            for j in range(n):
                if grid[i][j] == "1":
                    count += 1
                    grid[i][j] = "0"
                    queue = deque([(i, j)])

                    while queue:
                        x, y = queue.popleft()

                        for dx, dy in directions:
                            nx, ny = x + dx, y + dy

                            if 0 <= nx < m and 0 <= ny < n and grid[nx][ny] == "1":
                                grid[nx][ny] = "0"
                                queue.append((nx, ny))

        return count
```

## DFS 代码

```python
from typing import List


class Solution:
    def numIslands(self, grid: List[List[str]]) -> int:
        if not grid or not grid[0]:
            return 0

        m, n = len(grid), len(grid[0])
        count = 0

        def dfs(x: int, y: int) -> None:
            if x < 0 or x >= m or y < 0 or y >= n or grid[x][y] == "0":
                return

            grid[x][y] = "0"

            dfs(x - 1, y)
            dfs(x + 1, y)
            dfs(x, y - 1)
            dfs(x, y + 1)

        for i in range(m):
            for j in range(n):
                if grid[i][j] == "1":
                    count += 1
                    dfs(i, j)

        return count
```

## 复杂度

- 时间复杂度：`O(m * n)`，每个格子最多被访问一次。
- 空间复杂度：最坏情况下为 `O(m * n)`。

# 今日小结

今天这 4 道题覆盖了几种很常用的能力：

- **链表归并**：把多个有序来源合成一个有序结果。
- **单调队列**：在固定窗口内保留最有价值的候选状态。
- **区间合并**：压缩重叠范围，得到不冲突的区间集合。
- **图搜索**：从一个起点出发，完整识别一个连通区域。

继续刷题时，我会刻意多问自己两个问题：

1. 当前题目中，哪些状态需要被保留下来？
2. 哪些状态已经不可能影响答案，可以及时丢掉或标记？

能把这两个问题想清楚，很多题就不会显得那么散了。
