"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function findSidebar(): HTMLElement | null {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("aside, nav, [class]"),
  );

  const candidates = elements
    .map((element) => {
      const className =
        typeof element.className === "string"
          ? element.className.toLowerCase()
          : "";

      const linkCount =
        element.querySelectorAll('a[href^="/"]').length;

      let score = linkCount;

      if (element.tagName === "ASIDE") score += 20;

      if (
        className.includes("sidebar") ||
        className.includes("side-nav") ||
        className.includes("sidenav")
      ) {
        score += 30;
      }

      return {
        element,
        score,
      };
    })
    .filter((item) => item.score >= 5)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.element ?? null;
}

function findAccountCard(): HTMLElement | null {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      'button, [role="button"], div',
    ),
  );

  return (
    elements
      .filter((element) => {
        const text = (element.innerText || "").trim();

        if (!text.includes("Local account")) {
          return false;
        }

        const rect = element.getBoundingClientRect();

        return (
          rect.width >= 120 &&
          rect.width <= 380 &&
          rect.height >= 38 &&
          rect.height <= 130
        );
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();

        return (
          aRect.width * aRect.height -
          bRect.width * bRect.height
        );
      })[0] ?? null
  );
}

export function ShellEnhancements() {
  const pathname = usePathname();

  useEffect(() => {
    if (
      pathname === "/login" ||
      pathname.startsWith("/login?")
    ) {
      return;
    }

    let sidebar: HTMLElement | null = null;
    let accountCard: HTMLElement | null = null;
    let menu: HTMLDivElement | null = null;

    let accountClick:
      | ((event: MouseEvent) => void)
      | null = null;

    let accountKeydown:
      | ((event: KeyboardEvent) => void)
      | null = null;

    const originalSidebarStyles: Record<string, string> = {};

    function closeMenu() {
      if (menu) {
        menu.remove();
        menu = null;
      }

      if (accountCard) {
        accountCard.setAttribute(
          "aria-expanded",
          "false",
        );
      }
    }

    async function signOut() {
      if (menu) {
        const button =
          menu.querySelector<HTMLButtonElement>("button");

        if (button) {
          button.disabled = true;
          button.textContent = "Signing out...";
        }
      }

      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
        });
      } finally {
        window.location.replace("/login");
      }
    }

    function openMenu(target: HTMLElement) {
      if (menu) {
        closeMenu();
        return;
      }

      const rect = target.getBoundingClientRect();

      menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      menu.setAttribute(
        "aria-label",
        "Account menu",
      );

      Object.assign(menu.style, {
        position: "fixed",
        top: `${Math.round(rect.bottom + 8)}px`,
        right: `${Math.max(
          16,
          Math.round(window.innerWidth - rect.right),
        )}px`,
        width: "190px",
        padding: "8px",
        background: "#ffffff",
        border: "1px solid #d9e1e8",
        borderRadius: "12px",
        boxShadow:
          "0 14px 40px rgba(15, 42, 65, 0.16)",
        zIndex: "99999",
        boxSizing: "border-box",
      });

      const heading = document.createElement("div");

      heading.textContent = "Account";

      Object.assign(heading.style, {
        padding: "7px 10px 9px",
        color: "#718090",
        fontSize: "11px",
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      });

      const logoutButton =
        document.createElement("button");

      logoutButton.type = "button";
      logoutButton.textContent = "Sign out";
      logoutButton.setAttribute(
        "role",
        "menuitem",
      );

      Object.assign(logoutButton.style, {
        width: "100%",
        minHeight: "42px",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        border: "0",
        borderRadius: "8px",
        background: "#f6f8fa",
        color: "#172b3d",
        fontFamily: "inherit",
        fontSize: "14px",
        fontWeight: "700",
        textAlign: "left",
        cursor: "pointer",
      });

      logoutButton.addEventListener(
        "mouseenter",
        () => {
          logoutButton.style.background =
            "#eef3f7";
        },
      );

      logoutButton.addEventListener(
        "mouseleave",
        () => {
          logoutButton.style.background =
            "#f6f8fa";
        },
      );

      logoutButton.addEventListener(
        "click",
        signOut,
      );

      menu.appendChild(heading);
      menu.appendChild(logoutButton);

      document.body.appendChild(menu);

      target.setAttribute(
        "aria-expanded",
        "true",
      );
    }

    function enableSidebarScroll() {
      const found = findSidebar();

      if (!found || found === sidebar) {
        return;
      }

      sidebar = found;

      originalSidebarStyles.overflowY =
        sidebar.style.overflowY;

      originalSidebarStyles.overflowX =
        sidebar.style.overflowX;

      originalSidebarStyles.maxHeight =
        sidebar.style.maxHeight;

      originalSidebarStyles.minHeight =
        sidebar.style.minHeight;

      originalSidebarStyles.overscrollBehavior =
        sidebar.style.overscrollBehavior;

      sidebar.style.setProperty(
        "overflow-y",
        "auto",
        "important",
      );

      sidebar.style.setProperty(
        "overflow-x",
        "hidden",
        "important",
      );

      sidebar.style.setProperty(
        "max-height",
        "100vh",
        "important",
      );

      sidebar.style.setProperty(
        "min-height",
        "0",
        "important",
      );

      sidebar.style.setProperty(
        "overscroll-behavior",
        "contain",
      );

      sidebar.style.setProperty(
        "scrollbar-gutter",
        "stable",
      );

      const innerNav =
        sidebar.querySelector<HTMLElement>("nav");

      if (
        innerNav &&
        innerNav !== sidebar
      ) {
        innerNav.style.setProperty(
          "min-height",
          "0",
          "important",
        );

        innerNav.style.setProperty(
          "overflow-y",
          "visible",
        );
      }
    }

    function bindAccountCard() {
      if (
        accountCard &&
        accountCard.isConnected
      ) {
        return;
      }

      const found = findAccountCard();

      if (!found) {
        return;
      }

      accountCard = found;

      accountCard.style.cursor = "pointer";

      accountCard.setAttribute(
        "aria-haspopup",
        "menu",
      );

      accountCard.setAttribute(
        "aria-expanded",
        "false",
      );

      accountCard.setAttribute(
        "title",
        "Account menu",
      );

      if (
        accountCard.tagName !== "BUTTON" &&
        !accountCard.hasAttribute("tabindex")
      ) {
        accountCard.tabIndex = 0;
      }

      accountClick = (event: MouseEvent) => {
        event.preventDefault();
        openMenu(found);
      };

      accountKeydown = (
        event: KeyboardEvent,
      ) => {
        if (
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          openMenu(found);
        }
      };

      found.addEventListener(
        "click",
        accountClick,
      );

      found.addEventListener(
        "keydown",
        accountKeydown,
      );
    }

    function refresh() {
      enableSidebarScroll();
      bindAccountCard();
    }

    function documentPointerDown(
      event: PointerEvent,
    ) {
      const target = event.target as Node | null;

      if (!target || !menu) {
        return;
      }

      if (
        menu.contains(target) ||
        accountCard?.contains(target)
      ) {
        return;
      }

      closeMenu();
    }

    function documentKeydown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    refresh();

    const observer = new MutationObserver(() => {
      refresh();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    document.addEventListener(
      "pointerdown",
      documentPointerDown,
    );

    document.addEventListener(
      "keydown",
      documentKeydown,
    );

    window.addEventListener(
      "resize",
      closeMenu,
    );

    return () => {
      observer.disconnect();

      document.removeEventListener(
        "pointerdown",
        documentPointerDown,
      );

      document.removeEventListener(
        "keydown",
        documentKeydown,
      );

      window.removeEventListener(
        "resize",
        closeMenu,
      );

      if (accountCard && accountClick) {
        accountCard.removeEventListener(
          "click",
          accountClick,
        );
      }

      if (
        accountCard &&
        accountKeydown
      ) {
        accountCard.removeEventListener(
          "keydown",
          accountKeydown,
        );
      }

      closeMenu();

      if (sidebar) {
        sidebar.style.overflowY =
          originalSidebarStyles.overflowY ?? "";

        sidebar.style.overflowX =
          originalSidebarStyles.overflowX ?? "";

        sidebar.style.maxHeight =
          originalSidebarStyles.maxHeight ?? "";

        sidebar.style.minHeight =
          originalSidebarStyles.minHeight ?? "";

        sidebar.style.overscrollBehavior =
          originalSidebarStyles.overscrollBehavior ?? "";

        sidebar.style.removeProperty(
          "scrollbar-gutter",
        );
      }
    };
  }, [pathname]);

  return null;
}