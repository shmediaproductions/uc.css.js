// ==UserScript==
// @name           Open Link in Unloaded Tab (context menu item)
// @author         aminomancer
// @homepage       https://github.com/aminomancer
// @description    Add a new menu item to context menus prompted by right/accel-clicking on links or other link-like affordances. The menu item will open the link in a new background tab without loading the page. So the tab will start unloaded or "discarded." The context menu entry appears in the content area context menu when right-clicking a link; and in every menu where bookmarks, history, and synced tabs can be interacted with — sidebar, menubar, toolbar, toolbar button popup, and library window. Script is a remake of "Open in Unloaded Tab" by xiaoxiaoflood, but intended for use with fx-autoconfig by MrOtherGuy. It should still work with other loaders that load user scripts per-window, such as alice0775's loader, but is not compatible with older loaders or those like xiaoxiaoflood's loader. The difference is that those loaders run scripts in the global execution context, and simply call a global function when a window is launched, (the global function takes the window as a parameter) whereas fx-autoconfig loads normal scripts entirely within the window context, unless explicitly told to do otherwise. When you open a bookmark or history item in an unloaded tab, the tab draws its title from the entry in the places database. But when you open a link in an unloaded tab, there is no preexisting title. Normally when opening a link in a tab, the title is updated as the tab loads, but since we're opening the tab unloaded from the beginning, Firefox is less likely to know what the document's final title is. By default, the script works around this by generating a temporary title for the tab based on the text of the link that was opened. So if you click a hyperlink "https://mozilla.org" whose label text says "Mozilla" the title will be set to Mozilla until the tab is loaded. But if you click a hyperlink whose label text is the same as the URL itself, the title will simply be the URL. There's a user preference for this, however. If you just want to use the URL for the title no matter what, toggle this pref to false in about:config: "userChrome.openLinkInUnloadedTab.use_link_text_as_tab_title_when_unknown"
// @include         main
// @include         chrome://browser/content/places/bookmarksSidebar.xhtml
// @include         chrome://browser/content/places/historySidebar.xhtml
// @include         chrome://browser/content/places/places.xhtml
// ==/UserScript==

// The default labels are in English, but you can edit the values below to change them. Firefox doesn't natively use any phrases like "Open in New Unlaoded Tab" so there isn't any reasonable way to automatically localize this script. I'd have to do all the localization work myself, but I can only speak two languages and I don't have any help. If anyone wants to contribute localized strings for any of my scripts please feel free to post them on my repo in the Issues or Discussions tab. In the meantime, please edit the strings below yourself to change the language.
const unloadedTabMenuL10n = {
    openAll: `Open All in Unloaded Tabs`, // Appears when right-clicking a container/folder in bookmarks or history.
    openBookmark: `Open in New Unloaded Tab`, // Appears when right-clicking a bookmark, history item, etc.
    openSyncedTab: `Open in a New Unloaded Tab`, // Appears when right-clicking a tab in the synced tabs sidebar.
    openLink: `Open Link in New Unloaded Tab`, // Appears when right-clicking a link in-content.
    accessKey: `u`, // Some menu items use a predefined access key. (The others are dynamically generated) Access keys are underlined in the menu item's label, and pressing them on your keyboard automatically selects the menu item. They serve as hotkeys while the context menu is open. The default access key is "u" for the English, "unloaded."
};

(function () {
    class UnloadedTabMenuBase {
        constructor() {
            if (!window.E10SUtils)
                XPCOMUtils.defineLazyModuleGetters(this, {
                    E10SUtils: `resource://gre/modules/E10SUtils.jsm`,
                });
            else this.E10SUtils = window.E10SUtils;

            this.useLinkPref = `userChrome.openLinkInUnloadedTab.use_link_text_as_tab_title_when_unknown`;
            this.setBoolPref(this.useLinkPref, true);

            this.QUERY_TYPE_BOOKMARKS = Ci.nsINavHistoryQueryOptions.QUERY_TYPE_BOOKMARKS;
            this.QUERY_TYPE_HISTORY = Ci.nsINavHistoryQueryOptions.QUERY_TYPE_HISTORY;

            this.placesMenuOpenUnloaded = this.create(document, "menuitem", {
                id: "placesContext_open:unloaded",
                label: unloadedTabMenuL10n.openBookmark,
                disabled: true,
                hidden: true,
                oncommand: `unloadedTabMenu.openTab(PlacesUIUtils.getViewForNode(document.popupNode).selectedNode.uri)`,
            });
            this.placesMenuOpenNewTab.after(this.placesMenuOpenUnloaded);

            this.placesMenuOpenAllUnloaded = this.create(document, "menuitem", {
                id: "placesContext_openContainer:unloaded",
                label: unloadedTabMenuL10n.openAll,
                disabled: true,
                hidden: true,
                oncommand: `unloadedTabMenu.openSelectedTabs()`,
            });
            this.placesMenuOpenContainer?.after(this.placesMenuOpenAllUnloaded);

            this.placesMenuOpenAllLinksUnloaded = this.create(document, "menuitem", {
                id: "placesContext_openLinks:unloaded",
                label: unloadedTabMenuL10n.openAll,
                disabled: true,
                hidden: true,
                oncommand: `unloadedTabMenu.openSelectedTabs()`,
            });
            this.placesMenuOpenAllLinks.after(this.placesMenuOpenAllLinksUnloaded);

            this.placesContextMenu.addEventListener("popupshowing", this);

            if (location.href !== `chrome://browser/content/browser.xhtml`) return;

            this.syncedMenuOpenAllUnloaded = this.create(document, "menuitem", {
                id: "syncedTabsOpenAllUnloaded",
                label: unloadedTabMenuL10n.openAll,
                accesskey: unloadedTabMenuL10n.accessKey,
                disabled: true,
                hidden: true,
                oncommand: `unloadedTabMenu.openAllSyncedFromDevice()`,
            });
            this.syncedMenuOpenAll.after(this.syncedMenuOpenAllUnloaded);

            this.syncedMenuOpenUnloaded = this.create(document, "menuitem", {
                id: "syncedTabsOpenAllUnloaded",
                label: unloadedTabMenuL10n.openSyncedTab,
                accesskey: unloadedTabMenuL10n.accessKey,
                disabled: true,
                hidden: true,
                oncommand: `unloadedTabMenu.openSyncedTabUnloaded()`,
            });
            this.syncedMenuOpenTab.after(this.syncedMenuOpenUnloaded);

            this.syncedContextMenu.addEventListener("popupshowing", this);

            this.contentMenuOpenLinkUnloaded = this.create(document, "menuitem", {
                id: "context-openlinkinunloadedtab",
                label: unloadedTabMenuL10n.openLink,
                accesskey: unloadedTabMenuL10n.accessKey,
                hidden: true,
                oncommand: `unloadedTabMenu.openTab(gContextMenu.linkURL, {fromContent: true, linkText: gContextMenu.linkTextStr})`,
            });
            this.contentMenuOpenLink.after(this.contentMenuOpenLinkUnloaded);
            this.contentContextMenu.addEventListener("popupshowing", this);
            this.contentContextMenu.addEventListener("popuphidden", this, false);
        }

        create(doc, tag, props, isHTML = false) {
            let el = isHTML ? doc.createElement(tag) : doc.createXULElement(tag);
            for (let prop in props) {
                el.setAttribute(prop, props[prop]);
            }
            return el;
        }

        handleEvent(e) {
            switch (e.type) {
                case "popuphidden":
                    if (e.originalTarget === this.contentContextMenu)
                        this.contentMenuOpenLinkUnloaded.hidden = true;
                    break;
                case "popupshowing":
                    switch (e.target) {
                        case this.contentContextMenu:
                            gContextMenu.showItem(
                                "context-openlinkinunloadedtab",
                                gContextMenu.onSaveableLink || gContextMenu.onPlainTextLink
                            );
                            break;
                        case this.placesContextMenu:
                            this.onPlacesContextMenuShowing(e);
                            break;
                        case this.syncedContextMenu:
                            this.onSyncedContextMenuShowing(e);
                            break;
                    }
                    break;
            }
        }

        onPlacesContextMenuShowing(_e) {
            this.placesMenuOpenAllUnloaded.disabled =
                this.placesMenuOpenContainer?.disabled &&
                this.placesMenuOpenBookmarkContainer?.disabled &&
                this.placesMenuOpenBookmarkLinks?.disabled;
            this.placesMenuOpenAllUnloaded.hidden =
                this.placesMenuOpenContainer?.hidden &&
                this.placesMenuOpenBookmarkContainer?.hidden &&
                this.placesMenuOpenBookmarkLinks?.hidden;
            this.placesMenuOpenAllLinksUnloaded.disabled = this.placesMenuOpenAllLinks?.disabled;
            this.placesMenuOpenAllLinksUnloaded.hidden = this.placesMenuOpenAllLinks?.hidden;
            this.placesMenuOpenUnloaded.disabled = this.placesMenuOpenNewTab?.disabled;
            this.placesMenuOpenUnloaded.hidden = this.placesMenuOpenNewTab?.hidden;
        }

        onSyncedContextMenuShowing(_e) {
            this.syncedContextMenuInited = true;
            this.syncedMenuOpenAllUnloaded.disabled = this.syncedMenuOpenAll?.disabled;
            this.syncedMenuOpenAllUnloaded.hidden = this.syncedMenuOpenAll?.hidden;
            this.syncedMenuOpenUnloaded.disabled = this.syncedMenuOpenTab?.disabled;
            this.syncedMenuOpenUnloaded.hidden = this.syncedMenuOpenTab?.hidden;
        }

        setBoolPref(pref, bool) {
            if (!Services.prefs.prefHasUserValue(pref)) Services.prefs.setBoolPref(pref, bool);
        }

        get useLinkAsTabTitle() {
            return Services.prefs.getBoolPref(this.useLinkPref, true);
        }

        get placesContextMenu() {
            return (
                this._placesContextMenu ||
                (this._placesContextMenu = document.getElementById("placesContext"))
            );
        }

        get contentContextMenu() {
            return (
                this._contentContextMenu ||
                (this._contentContextMenu = document.getElementById("contentAreaContextMenu"))
            );
        }

        get syncedContextMenu() {
            return (
                this._syncedContextMenu ||
                (this._syncedContextMenu = document.getElementById("SyncedTabsSidebarContext"))
            );
        }

        get placesMenuOpenContainer() {
            return (
                this._placesMenuOpenContainer ||
                (this._placesMenuOpenContainer = document.getElementById(
                    "placesContext_openContainer:tabs"
                ))
            );
        }

        get placesMenuOpenBookmarkContainer() {
            return (
                this._placesMenuOpenBookmarkContainer ||
                (this._placesMenuOpenBookmarkContainer = document.getElementById(
                    "placesContext_openBookmarkContainer:tabs"
                ))
            );
        }

        get placesMenuOpenBookmarkLinks() {
            return (
                this._placesMenuOpenBookmarkLinks ||
                (this._placesMenuOpenBookmarkLinks = document.getElementById(
                    "placesContext_openBookmarkLinks:tabs"
                ))
            );
        }

        get placesMenuOpenAllLinks() {
            return (
                this._placesMenuOpenAllLinks ||
                (this._placesMenuOpenAllLinks = document.getElementById(
                    "placesContext_openLinks:tabs"
                ))
            );
        }

        get placesMenuOpenNewTab() {
            return (
                this._placesMenuOpenNewTab ||
                (this._placesMenuOpenNewTab = document.getElementById("placesContext_open:newtab"))
            );
        }

        get syncedMenuOpenAll() {
            return (
                this._syncedMenuOpenAll ||
                (this._syncedMenuOpenAll = this.syncedContextMenu.querySelector(
                    "#syncedTabsOpenAllInTabs"
                ))
            );
        }

        get syncedMenuOpenTab() {
            return (
                this._syncedMenuOpenTab ||
                (this._syncedMenuOpenTab = this.syncedContextMenu.querySelector(
                    "#syncedTabsOpenSelectedInTab"
                ))
            );
        }

        get contentMenuOpenLink() {
            return (
                this._contentMenuOpenLink ||
                (this._contentMenuOpenLink = document.getElementById("context-openlinkintab"))
            );
        }

        openSelectedTabs(nodes) {
            if (!nodes) {
                let view = PlacesUIUtils.getViewForNode(document.popupNode);
                nodes = view.selectedNode || view.selectedNodes || view.result.root;
            }
            if (PlacesUtils.nodeIsContainer(nodes))
                nodes = PlacesUtils.getURLsForContainerNode(nodes);
            nodes.forEach((node) => this.openTab(node.uri, { bulkOpen: true }));
        }

        openSyncedTabUnloaded() {
            if (!this.syncedContextMenuInited) return;
            let item = document.popupNode
                .closest(".tabs-container")
                .querySelector(".item.selected");
            if (item) this.openTab(item.dataset.url, { syncedTabs: true });
        }

        openAllSyncedFromDevice() {
            if (!this.syncedContextMenuInited) return;
            let item = document.popupNode
                .closest(".tabs-container")
                .querySelector(".item.selected");
            if (item) {
                const tabs = item.querySelector(".item-tabs-list").children;
                const urls = [...tabs].map((tab) => tab.dataset.url);
                urls.forEach((url) => this.openTab(url, { bulkOpen: true, syncedTabs: true }));
            }
        }

        async openTab(url, params = {}) {
            let win = window.gBrowser ? window : BrowserWindowTracker.getTopWindow();
            let { gBrowser } = win;

            let tabParams = {};
            if (params.fromContent && gContextMenu)
                tabParams = gContextMenu._openLinkInParameters({
                    userContextId: gBrowser.selectedTab.userContextId,
                });
            else {
                if (params.bulkOpen)
                    tabParams = {
                        skipAnimation: true,
                        bulkOrderedOpen: true,
                    };
                tabParams.triggeringPrincipal =
                    location.href === `chrome://browser/content/browser.xhtml` && !params.syncedTabs
                        ? gBrowser.selectedBrowser.contentPrincipal
                        : Services.scriptSecurityManager.getSystemPrincipal();
            }
            tabParams.noInitialLabel = true;

            let tab = gBrowser.addTab(null, tabParams);
            let uri = Services.io.newURI(url);
            let info =
                this.getInfoFromHistory(uri, this.QUERY_TYPE_HISTORY) ||
                this.getInfoFromHistory(uri, this.QUERY_TYPE_BOOKMARKS);

            win.SessionStore.setTabState(tab, {
                entries: [
                    {
                        url: url,
                        title: info?.title || (this.useLinkAsTabTitle && params.linkText),
                        triggeringPrincipal_base64: this.E10SUtils.serializePrincipal(
                            tabParams.triggeringPrincipal
                        ),
                    },
                ],
                lastAccessed: tab.lastAccessed,
            });

            let iconURL;
            let isReady = false;

            PlacesUtils.favicons.getFaviconURLForPage(uri, async function (url) {
                if (!url) return;
                let blob = await fetch(url.spec).then((r) => r.blob());
                let reader = new FileReader();
                reader.onloadend = function () {
                    iconURL = reader.result;
                    win.unloadedTabMenu.maybeSetIcon(tab, iconURL, isReady);
                };
                reader.readAsDataURL(blob);
            });

            tab.addEventListener(
                "SSTabRestoring",
                function () {
                    isReady = true;
                    win.unloadedTabMenu.maybeSetIcon(tab, iconURL, isReady);
                },
                { once: true }
            );
        }

        maybeSetIcon(tab, iconURL, isReady) {
            if (iconURL && isReady) tab.ownerGlobal.gBrowser.setIcon(tab, iconURL, null);
        }

        getInfoFromHistory(aURI, aQueryType) {
            let options = PlacesUtils.history.getNewQueryOptions();
            options.queryType = aQueryType;
            options.maxResults = 1;

            let query = PlacesUtils.history.getNewQuery();
            query.uri = aURI;

            let root = PlacesUtils.history.executeQuery(query, options).root;
            root.containerOpen = true;

            if (!root.childCount) {
                root.containerOpen = false;
                return null;
            }

            let child = root.getChild(0);
            root.containerOpen = false;

            return {
                title: child.title,
                icon: child.icon,
            };
        }
    }

    function init() {
        window.unloadedTabMenu = new UnloadedTabMenuBase();
    }

    if (
        location.href !== `chrome://browser/content/browser.xhtml` ||
        gBrowserInit.delayedStartupFinished
    ) {
        init();
    } else {
        let delayedListener = (subject, topic) => {
            if (topic == "browser-delayed-startup-finished" && subject == window) {
                Services.obs.removeObserver(delayedListener, topic);
                init();
            }
        };
        Services.obs.addObserver(delayedListener, "browser-delayed-startup-finished");
    }
})();
