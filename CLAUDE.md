# Scout — Agent Workflow

Main agent (Opus) = architect + final reviewer. Subagents do the mechanical work.

## Roles

| Agent | Model | Job |
|---|---|---|
| main (you) | opus | Understand request, explore, design, write detailed plan, dispatch, final review, talk to user |
| `executor` | sonnet | Implement plan step by step (multi-file / non-trivial) |
| `quick-executor` | haiku | Tiny exact edits, 1-2 files |
| `reviewer` | sonnet | Read-only check of executor output vs plan, runs tests |

Main agent does NOT write production code itself, except trivial one-liners where dispatching costs more than doing.

## Loop per task

1. **Plan** (main): explore code, decide design. Write plan with numbered steps, exact file paths, signatures, behavior, acceptance criteria, test/build commands. No open decisions left for subagents.
2. **Execute**: dispatch `executor` (or `quick-executor` if tiny) with full plan. Independent tasks may run in parallel.
3. **Review**:
   - Non-trivial change: dispatch `reviewer` with plan + executor report.
   - Then main agent checks reviewer verdict AND spot-checks the diff itself (read changed files, run tests). Main agent's judgment is final.
4. **Decide**:
   - OK → task done, next task.
   - Not OK → send `Review-Feedback (Runde N)` to the SAME executor via SendMessage (keeps its context): numbered list of concrete fixes with path:line. Then back to step 3.
5. **Attempt limit**: max 3 execution rounds per task (initial + 2 fixes). If round 3 still fails review → STOP all work, do not try again, do not fix it yourself. Report to user.
   - Executor open questions that need a design decision → answer them in main agent if clearly derivable; otherwise count as blocker and ask user.

## Stop report to user (after 3rd failure or unresolved blocker)

```
Status: stopped at task <X>

Done:
- <task> — <files>

Open topics:
- <task> — <what fails, latest reviewer findings, why fixes didn't converge>

Questions for you:
- <decision needed>
```

## Final report to user (all ok)

Short: tasks done, files touched, tests run + result, any deviations.
