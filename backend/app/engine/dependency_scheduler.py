from collections import defaultdict, deque
from typing import Sequence

from ..schemas.plan_state import TaskNode


class CyclicDependencyError(Exception):
    """Raised when dependency graph contains one or more cycles."""
    pass


def topological_sort_tasks(tasks: Sequence[TaskNode]) -> list[TaskNode]:
    """Applies Kahn's algorithm for topological sorting of tasks.
    
    Raises CyclicDependencyError if any cycle is detected.
    """
    task_map: dict[str, TaskNode] = {t.id: t for t in tasks}
    in_degree: dict[str, int] = {t.id: 0 for t in tasks}
    adj: dict[str, list[str]] = defaultdict(list)

    for task in tasks:
        for dep_id in task.dependencies:
            if dep_id in task_map:
                adj[dep_id].append(task.id)
                in_degree[task.id] += 1

    queue: deque[str] = deque([t_id for t_id, deg in in_degree.items() if deg == 0])
    sorted_order: list[TaskNode] = []

    while queue:
        curr_id = queue.popleft()
        sorted_order.append(task_map[curr_id])

        for neighbor in adj[curr_id]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(sorted_order) != len(tasks):
        visited_ids = {task.id for task in sorted_order}
        unvisited = [task.id for task in tasks if task.id not in visited_ids]
        raise CyclicDependencyError(f"Dependency cycle detected involving tasks: {unvisited}")

    return sorted_order


def compute_cpm_schedule(tasks: Sequence[TaskNode]) -> list[TaskNode]:
    """Performs forward and backward pass Critical Path Method (CPM).
    
    Calculates earliest_start, latest_start, slack_days, and marks is_critical = (slack_days == 0).
    """
    sorted_tasks = topological_sort_tasks(tasks)
    task_map: dict[str, TaskNode] = {t.id: t.model_copy() for t in sorted_tasks}

    adj: dict[str, list[str]] = defaultdict(list)
    rev_adj: dict[str, list[str]] = defaultdict(list)

    for task in sorted_tasks:
        for dep_id in task.dependencies:
            if dep_id in task_map:
                adj[dep_id].append(task.id)
                rev_adj[task.id].append(dep_id)

    # Forward Pass: earliest_start and earliest_finish
    earliest_finish: dict[str, int] = {}
    for task in sorted_tasks:
        if not rev_adj[task.id]:
            t_es = 0
        else:
            t_es = max(earliest_finish[pred_id] for pred_id in rev_adj[task.id])
        task_map[task.id].earliest_start = t_es
        earliest_finish[task.id] = t_es + task.duration_days

    project_duration = max(earliest_finish.values()) if earliest_finish else 0

    # Backward Pass: latest_finish and latest_start
    latest_finish: dict[str, int] = {}
    for task in reversed(sorted_tasks):
        if not adj[task.id]:
            t_lf = project_duration
        else:
            t_lf = min(
                task_map[succ_id].latest_start
                for succ_id in adj[task.id]
            )
        latest_finish[task.id] = t_lf
        t_ls = t_lf - task.duration_days
        task_map[task.id].latest_start = max(0, t_ls)
        
        slack = max(0, task_map[task.id].latest_start - task_map[task.id].earliest_start)
        task_map[task.id].slack_days = slack
        task_map[task.id].is_critical = (slack == 0)

    return [task_map[t.id] for t in tasks]

