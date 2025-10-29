# Timeline Show All Scenes - Bug Fix PRP

**Story**: Fix timeline to show ALL generated scenes, not just approved ones

**Type**: Bug Fix
**Complexity**: Low-Medium
**Created**: 2025-10-30
**Confidence Score**: 9/10 for one-pass implementation

---

## 1. STORY GOAL

### User Problem

**Current Broken Behavior:**
1. User generates Scene 1 → Clicks "Approve & Continue" → Scene 1 appears in timeline ✅
2. User generates Scene 2 → Scene 2 does NOT appear in timeline ❌
3. Timeline only shows Scene 1 (old video)
4. User must click "Approve & Continue" on Scene 2 before it appears in timeline

**Root Cause:**
Timeline filters scenes by `isLocked: true` status. Only "approved" scenes are included in timeline generation and display. New scenes start with `isLocked: false`, so they're invisible to the timeline system.

### Desired Behavior

**After Fix:**
1. User generates Scene 1 → Appears in timeline immediately ✅
2. User generates Scene 2 → Appears in timeline immediately ✅
3. Timeline shows ALL scenes sequentially (Scene 1 → Scene 2 → Scene 3...)
4. No forced "approval" workflow needed to see scenes in timeline
5. User can still remix/delete individual scenes as needed

### Success Criteria

- ✅ Timeline shows ALL generated scenes, regardless of `isLocked` status
- ✅ When Scene 2 is generated, timeline auto-includes it (after regeneration)
- ✅ Timeline video plays continuously across ALL scenes
- ✅ Scene cards in timeline track display ALL scenes
- ✅ Playhead syncs correctly across ALL scenes
- ✅ Build succeeds with no TypeScript errors

---

## 2. CONTEXT

### Current Architecture

**Timeline Generation Flow** (`src/stores/sceneBuilderStore.ts`, lines 508-617):
```typescript
generateTimeline: async () => {
  // PROBLEM: Filters out unlocked scenes
  const approvedScenes = scenes.filter(s => s.isLocked);

  if (approvedScenes.length === 0) {
    set({ error: 'Please approve at least one scene before generating timeline' });
    return;
  }

  // Only concatenates approved scenes
  for (const scene of approvedScenes) {
    // ... extract video blobs and concatenate
  }
}
```

**Timeline Display** (`src/components/scene-builder/TimelineTrack.tsx`, lines 15-23):
```typescript
export function TimelineTrack() {
  // PROBLEM: Filters out unlocked scenes
  const approvedScenes = scenes.filter(s => s.isLocked);

  if (approvedScenes.length === 0) {
    return <div>No approved scenes yet...</div>;
  }

  // Only renders approved scenes
  return (
    <div>
      {approvedScenes.map((scene, index) => (
        <SceneCard key={scene.id} scene={scene} ... />
      ))}
    </div>
  );
}
```

**Scene Lifecycle:**
```
Scene Creation → isLocked: false (unlocked)
   ↓
User clicks "Approve & Continue"
   ↓
approveVersion() → isLocked: true (locked)
   ↓
Timeline shows scene (because isLocked === true)
```

### Files with `isLocked` Filters

**7 locations need updates:**

| File | Line(s) | Filter Code |
|------|---------|-------------|
| `src/stores/sceneBuilderStore.ts` | 518 | `scenes.filter(s => s.isLocked)` in `generateTimeline()` |
| `src/stores/sceneBuilderStore.ts` | 625 | `scenes.findIndex(s => s.id === sceneId && s.isLocked)` in `seekToScene()` |
| `src/components/scene-builder/TimelineTrack.tsx` | 15 | `scenes.filter(s => s.isLocked)` |
| `src/components/scene-builder/TimelinePlayer.tsx` | 53 | `scenes.filter(s => s.isLocked)` in `detectSceneChange()` |

**Note:** The `approveVersion()` action (line 275) and `extendToNextScene()` requirement (line 344) can remain as-is. They're part of the workflow but don't affect timeline display.

### Key Design Decision

**Why remove the filter?**
1. **Better UX**: Users want to see their work immediately, not after forced approval
2. **Timeline = Visual Preview**: Timeline should show the complete video as-is
3. **Approval is Optional**: Users can still approve/lock scenes for workflow tracking
4. **Matches Mental Model**: "I generated 2 scenes, I should see 2 scenes in timeline"

---

## 3. IMPLEMENTATION TASKS

### Task 1: Remove `isLocked` Filter from Timeline Generation

**File**: `src/stores/sceneBuilderStore.ts`

**Action**: UPDATE `generateTimeline()` function (lines 508-617)

**Changes:**
1. Replace `approvedScenes` variable with `allScenes`
2. Remove "no approved scenes" error message
3. Keep single-scene optimization logic

**Find:**
```typescript
// Get all approved (locked) scenes
const approvedScenes = scenes.filter(s => s.isLocked);

if (approvedScenes.length === 0) {
  set({ error: 'Please approve at least one scene before generating timeline' });
  return;
}
```

**Replace with:**
```typescript
// Get all scenes for timeline (locked or unlocked)
const allScenes = scenes;

if (allScenes.length === 0) {
  set({ error: 'No scenes to generate timeline' });
  return;
}
```

**Find (line ~527):**
```typescript
// Edge case: Single scene - no concatenation needed
if (approvedScenes.length === 1) {
  const scene = approvedScenes[0];
```

**Replace with:**
```typescript
// Edge case: Single scene - no concatenation needed
if (allScenes.length === 1) {
  const scene = allScenes[0];
```

**Find (line ~560):**
```typescript
for (const scene of approvedScenes) {
```

**Replace with:**
```typescript
for (const scene of allScenes) {
```

**Validation:**
```bash
npm run build
# Should compile without errors
grep "approvedScenes" src/stores/sceneBuilderStore.ts
# Should return 0 results in generateTimeline function
```

---

### Task 2: Remove `isLocked` Filter from Timeline Track Display

**File**: `src/components/scene-builder/TimelineTrack.tsx`

**Action**: UPDATE scene filtering logic (lines 15-23)

**Find:**
```typescript
const approvedScenes = scenes.filter(s => s.isLocked);

if (approvedScenes.length === 0) {
  return (
    <div className="timeline-track empty">
      <p>No approved scenes yet. Approve a scene to start building your timeline.</p>
    </div>
  );
}
```

**Replace with:**
```typescript
const allScenes = scenes;

if (allScenes.length === 0) {
  return (
    <div className="timeline-track empty">
      <p>No scenes yet. Generate scenes to build your timeline.</p>
    </div>
  );
}
```

**Find (line ~43):**
```typescript
{approvedScenes.map((scene, index) => {
```

**Replace with:**
```typescript
{allScenes.map((scene, index) => {
```

**Validation:**
```bash
npm run build
grep "approvedScenes" src/components/scene-builder/TimelineTrack.tsx
# Should return 0 results
```

---

### Task 3: Remove `isLocked` Filter from Timeline Player Scene Detection

**File**: `src/components/scene-builder/TimelinePlayer.tsx`

**Action**: UPDATE `detectSceneChange()` function (lines 50-69)

**Find:**
```typescript
const detectSceneChange = (currentTime: number) => {
  if (cumulativeDurations.length === 0) return;

  const approvedScenes = scenes.filter(s => s.isLocked);

  // Binary search for current scene
  let sceneIndex = 0;
  for (let i = 0; i < cumulativeDurations.length - 1; i++) {
    if (currentTime >= cumulativeDurations[i] && currentTime < cumulativeDurations[i + 1]) {
      sceneIndex = i;
      break;
    }
  }

  const currentScene = approvedScenes[sceneIndex];
```

**Replace with:**
```typescript
const detectSceneChange = (currentTime: number) => {
  if (cumulativeDurations.length === 0) return;

  const allScenes = scenes;

  // Binary search for current scene
  let sceneIndex = 0;
  for (let i = 0; i < cumulativeDurations.length - 1; i++) {
    if (currentTime >= cumulativeDurations[i] && currentTime < cumulativeDurations[i + 1]) {
      sceneIndex = i;
      break;
    }
  }

  const currentScene = allScenes[sceneIndex];
```

**Validation:**
```bash
npm run build
grep "approvedScenes" src/components/scene-builder/TimelinePlayer.tsx
# Should return 0 results
```

---

### Task 4: Remove `isLocked` Requirement from Seek Action

**File**: `src/stores/sceneBuilderStore.ts`

**Action**: UPDATE `seekToScene()` action (lines 623-634)

**Find:**
```typescript
seekToScene: (sceneId: string) => {
  const { scenes, cumulativeDurations } = get();
  const sceneIndex = scenes.findIndex(s => s.id === sceneId && s.isLocked);

  if (sceneIndex === -1) {
    console.warn(`Scene ${sceneId} not found or not approved`);
    return;
  }
```

**Replace with:**
```typescript
seekToScene: (sceneId: string) => {
  const { scenes, cumulativeDurations } = get();
  const sceneIndex = scenes.findIndex(s => s.id === sceneId);

  if (sceneIndex === -1) {
    console.warn(`Scene ${sceneId} not found`);
    return;
  }
```

**Validation:**
```bash
npm run build
grep "s.id === sceneId && s.isLocked" src/stores/sceneBuilderStore.ts
# Should return 0 results
```

---

### Task 5: Verify Build and Type Checking

**Action**: RUN validation commands to ensure no TypeScript errors

**Commands:**
```bash
# TypeScript compilation check
npx tsc --noEmit

# Build verification
npm run build

# Verify no approvedScenes references remain in timeline code
grep -n "approvedScenes" src/stores/sceneBuilderStore.ts src/components/scene-builder/Timeline*.tsx
# Should return 0 results

# Verify timeline functions exist
grep -n "generateTimeline\|seekToScene" src/stores/sceneBuilderStore.ts | wc -l
# Should return at least 2 (function definitions)
```

**Success Criteria:**
- ✅ `npx tsc --noEmit` shows 0 errors
- ✅ `npm run build` succeeds
- ✅ No `approvedScenes` references in timeline-related files
- ✅ All timeline actions still present in store

---

## 4. TESTING STRATEGY

### Manual Testing Checklist

After implementing the fix, test these scenarios:

**Test 1: Single Scene Timeline**
1. Generate Scene 1
2. Click "Timeline View" (without approving)
3. ✅ Expected: Scene 1 appears in timeline and plays
4. ✅ Expected: Timeline shows "0:00 / [duration]"

**Test 2: Multi-Scene Timeline**
1. Generate Scene 1 → Click "Approve & Continue"
2. Generate Scene 2 (do NOT approve)
3. Click "Timeline View"
4. ✅ Expected: Timeline shows BOTH Scene 1 and Scene 2
5. ✅ Expected: Video plays continuously from Scene 1 → Scene 2
6. ✅ Expected: Timeline track shows 2 scene cards

**Test 3: Timeline After Adding Scene 3**
1. From Test 2 state (Scene 1 + Scene 2 in timeline)
2. Click "Edit Mode"
3. Generate Scene 3
4. Click "Timeline View"
5. ✅ Expected: Timeline regenerates with Scene 1 → Scene 2 → Scene 3
6. ✅ Expected: Playhead works correctly across all 3 scenes

**Test 4: Scene Card Clicking**
1. Have 3 scenes in timeline
2. Click Scene 2 card
3. ✅ Expected: Video seeks to start of Scene 2
4. ✅ Expected: Scene 2 card shows "active" highlight

**Test 5: Approval Still Works (Optional)**
1. Generate Scene 1 → Click "Approve & Continue"
2. ✅ Expected: Scene 1 becomes `isLocked: true`
3. ✅ Expected: Last frame preview shows
4. ✅ Expected: UI switches to "Next Scene" mode
5. ✅ Expected: Timeline shows Scene 1 normally

---

## 5. VALIDATION COMMANDS

### Build Validation
```bash
npm run build
# Must succeed with no TypeScript errors
```

### Type Checking
```bash
npx tsc --noEmit
# Must show 0 errors
```

### Code Verification
```bash
# Verify no approvedScenes in timeline code
grep -r "approvedScenes" src/stores/sceneBuilderStore.ts src/components/scene-builder/Timeline*.tsx
# Should return: (no matches)

# Verify generateTimeline uses allScenes
grep -A 5 "generateTimeline:" src/stores/sceneBuilderStore.ts | grep "allScenes"
# Should return: const allScenes = scenes;

# Verify seekToScene doesn't check isLocked
grep -A 3 "seekToScene:" src/stores/sceneBuilderStore.ts | grep "isLocked"
# Should return: (no matches)
```

### Runtime Validation
```bash
npm run dev:vercel
# Open http://localhost:3000/scene-builder
# Follow Manual Testing Checklist above
```

---

## 6. EDGE CASES & GOTCHAS

### Edge Case 1: Empty Timeline
**Scenario:** User hasn't generated any scenes yet
**Current Behavior:** Shows "No approved scenes" message
**After Fix:** Shows "No scenes yet. Generate scenes to build your timeline."
**Handled by:** Task 2 (TimelineTrack.tsx update)

### Edge Case 2: Single Scene Timeline
**Scenario:** User has only 1 scene (approved or not)
**Current Behavior:** Works correctly (no concatenation needed)
**After Fix:** Still works correctly
**Handled by:** Task 1 maintains single-scene optimization (line ~527)

### Edge Case 3: Timeline with Mixed Locked/Unlocked Scenes
**Scenario:** Scene 1 (locked) + Scene 2 (unlocked) + Scene 3 (locked)
**Current Behavior:** Only shows Scene 1 and Scene 3
**After Fix:** Shows all 3 scenes in order
**Handled by:** Removing all `isLocked` filters

### Edge Case 4: Seek to Unlocked Scene
**Scenario:** User clicks unlocked Scene 2 card in timeline
**Current Behavior:** Warns "Scene not found or not approved"
**After Fix:** Seeks correctly to Scene 2
**Handled by:** Task 4 (seekToScene() update)

### Gotcha 1: Frame Continuity
**Concern:** Does removing `isLocked` break frame continuity?
**Answer:** No. Frame continuity happens in `extendToNextScene()` which still requires the PREVIOUS scene to be locked (line 344). This is correct - you can't extend from an unlocked scene because you need the finalized last frame.

### Gotcha 2: Approval Workflow
**Concern:** Does this break the approval workflow entirely?
**Answer:** No. Approval still works and is still required to extend to the next scene. The change only affects timeline DISPLAY, not the approval workflow logic.

### Gotcha 3: Timeline Invalidation
**Concern:** When does timeline regenerate after adding Scene 2?
**Answer:** Timeline is already invalidated in `extendToNextScene()` (line 418). When user clicks "Timeline View", it will regenerate with all scenes.

---

## 7. ROLLBACK PLAN

If the fix causes issues, rollback is simple:

**Revert Task 1:**
```typescript
const approvedScenes = scenes.filter(s => s.isLocked);
```

**Revert Task 2:**
```typescript
const approvedScenes = scenes.filter(s => s.isLocked);
```

**Revert Task 3:**
```typescript
const approvedScenes = scenes.filter(s => s.isLocked);
```

**Revert Task 4:**
```typescript
const sceneIndex = scenes.findIndex(s => s.id === sceneId && s.isLocked);
```

All changes are isolated to 4 files, no data model changes.

---

## 8. COMPLETION CRITERIA

### Implementation Complete When:
- [x] Task 1: `generateTimeline()` uses `allScenes` instead of `approvedScenes`
- [x] Task 2: `TimelineTrack` displays `allScenes` instead of `approvedScenes`
- [x] Task 3: `TimelinePlayer.detectSceneChange()` uses `allScenes`
- [x] Task 4: `seekToScene()` doesn't check `isLocked`
- [x] Task 5: Build succeeds with `npm run build`
- [x] All validation commands pass

### User Acceptance When:
- [x] User generates Scene 1 → Sees it in timeline (without approving)
- [x] User generates Scene 2 → Sees BOTH Scene 1 and Scene 2 in timeline
- [x] Timeline plays continuously across all scenes
- [x] Clicking scene cards seeks correctly
- [x] Approval workflow still works (can lock scenes and extend)

---

**END OF PRP**
