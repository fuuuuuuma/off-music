import { useEffect, type RefObject } from "react";

/** Native selection/callouts must not take a held finger away from the game. */
export function usePlaySurface(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const protectedTarget = (target: Node | null) => {
      const element =
        target instanceof Element ? target : target?.parentElement;
      return (
        !!element &&
        root.contains(element) &&
        !element.closest(".sheet,input,textarea,select,[contenteditable]")
      );
    };
    const clearSelection = () => {
      const selection = document.getSelection();
      if (
        selection &&
        !selection.isCollapsed &&
        (protectedTarget(selection.anchorNode) ||
          protectedTarget(selection.focusNode))
      )
        selection.removeAllRanges();
    };
    const suppress = (event: Event) => {
      if (!protectedTarget(event.target as Node | null)) return;
      if (event.cancelable) event.preventDefault();
      clearSelection();
    };
    root.addEventListener("contextmenu", suppress);
    root.addEventListener("selectstart", suppress);
    root.addEventListener("dragstart", suppress);
    document.addEventListener("selectionchange", clearSelection);
    clearSelection();
    return () => {
      root.removeEventListener("contextmenu", suppress);
      root.removeEventListener("selectstart", suppress);
      root.removeEventListener("dragstart", suppress);
      document.removeEventListener("selectionchange", clearSelection);
    };
  }, [ref]);
}
