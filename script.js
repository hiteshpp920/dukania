// ─────────────────────────────────────────────
// MULTI-TENANT script.js
// SHOP_ID comes from index.html (window.SHOP_ID)
// All localStorage keys are scoped: key_SHOP_ID
// ─────────────────────────────────────────────

// ── SHOP ID (set by index.html before this script runs) ──
function getShopId() {
    return window.SHOP_ID || new URLSearchParams(window.location.search).get("shop") || "default";
}

// ── SCOPED STORAGE KEYS ──
function cartKey()    { return "cart_"    + getShopId(); }
function reviewsKey() { return "reviews_" + getShopId(); }
function historyKey() { return "history_" + getShopId(); }
function userKey()    { return "user_"    + getShopId(); }

// ── INIT ──
let cart = {};
let reviewsData = {};

try { const s = localStorage.getItem(cartKey());    if (s) cart        = JSON.parse(s); } catch(e) {}
try { const s = localStorage.getItem(reviewsKey()); if (s) reviewsData = JSON.parse(s); } catch(e) {}

// ─────────────────────────────────────────────
// PAGE LOAD
// ─────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", function () {

    // Auth check — scoped per shop
    if (!localStorage.getItem(userKey())) {
        window.location.href = "login.html?shop=" + getShopId();
        return;
    }

    // Header avatar + checkout autofill
    try {
        const user = JSON.parse(localStorage.getItem(userKey()));
        const headerUser = document.getElementById("headerUser");
        if (headerUser && user) {
            headerUser.innerHTML = '<div class="user-avatar-small" onclick="showProfile()">' + user.name.charAt(0).toUpperCase() + '</div>';
        }
        const n = document.getElementById("customerName");
        const p = document.getElementById("customerPhone");
        const a = document.getElementById("customerAddress");
        if (n && !n.value) n.value = user.name;
        if (p && !p.value) p.value = user.phone;
        if (a && !a.value) a.value = user.address;
    } catch(e) {}

    renderCart();

    // Search
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", function () {
            const value = this.value.toLowerCase().trim();
            const hindiMap = {
                "रंगीन पेंसिल": "color pencils", "क्रेयॉन": "crayons",
                "वाटर कलर": "water colors", "रंग": "water colors",
                "क्राफ्ट पेपर": "craft paper", "कागज": "craft paper",
                "नोटबुक": "notebook", "कॉपी": "notebook",
                "पानी की बोतल": "water bottle", "बोतल": "water bottle",
                "पेन": "blue gel pen", "गाड़ी": "hot wheels",
                "खिलौना": "hot wheels rubik cube"
            };
            let sv = value;
            for (let h in hindiMap) { if (value.includes(h)) { sv = hindiMap[h]; break; } }
            const products = document.querySelectorAll(".product");
            const noResult = document.getElementById("noResult");
            let visible = 0;
            products.forEach(function (p) {
                const txt = p.innerText.toLowerCase();
                const dn  = (p.getAttribute("data-name") || "").toLowerCase();
                if (!sv || txt.includes(sv) || dn.includes(sv)) { p.style.display = "flex"; visible++; }
                else p.style.display = "none";
            });
            if (noResult) noResult.style.display = visible === 0 ? "block" : "none";
        });
    }
});

// ─────────────────────────────────────────────
// RENDER PRODUCTS  (called by index.html Firebase listener)
// ─────────────────────────────────────────────
window.renderProducts = function(products) {
    const section = document.querySelector(".products-section");
    if (!section) return;

    if (products.length === 0) {
        section.innerHTML = '<div style="text-align:center; padding:40px; color:#9ca3af;"><div style="font-size:40px;">📦</div><p style="margin-top:10px;">No products yet. Check back soon!</p></div>';
        return;
    }

    // Use categories from window.ALL_CATEGORIES for emoji lookup
    function getCatEmoji(catName) {
        const cats = window.ALL_CATEGORIES || [];
        const found = cats.find(function(c) { return c.name === catName; });
        return found ? found.emoji : "📦";
    }

    // Group by category
    const grouped = {};
    products.forEach(function(p) {
        if (!grouped[p.category]) grouped[p.category] = [];
        grouped[p.category].push(p);
    });

    let html = "";
    for (const cat in grouped) {
        html += '<h2 class="category-title">' + getCatEmoji(cat) + " " + cat + '</h2>';
        html += '<div class="category-row">';
        grouped[cat].forEach(function(p) {
            const save = p.origPrice - p.price;
            const oos  = p.stock === false;
            html += '<div class="product" data-name="' + p.name + '"' + (oos ? ' style="opacity:0.6;"' : '') + '>' +
                '<img src="' + p.image + '" class="product-image" alt="' + p.name + '" onclick="openZoom(\'' + p.image.replace(/'/g, "\\'") + '\')" onerror="this.style.opacity=\'0\'">' +
                (oos ? '<div class="oos-badge">Out of Stock</div>' : '') +
                '<h3>' + p.name + '</h3>' +
                (p.desc ? '<p class="product-desc">' + p.desc + '</p>' : '') +
                '<div class="price-box">' +
                    '<span class="orig-price">₹' + p.origPrice + '</span>' +
                    '<span class="our-price">₹' + p.price + '</span>' +
                    '<span class="save-badge">💰 Save ₹' + save + '</span>' +
                '</div>' +
                '<div class="qty-box">' +
                    '<button class="qty-btn" ' + (oos ? 'disabled style="opacity:0.4"' : '') + ' onclick="changeQty(\'' + p.name.replace(/'/g, "\\'") + '\',' + p.price + ',-1)">−</button>' +
                    '<span class="qty-display" id="qty-' + p.name + '">' + (cart[p.name] ? cart[p.name].qty : 0) + '</span>' +
                    '<button class="qty-btn" ' + (oos ? 'disabled style="opacity:0.4"' : '') + ' onclick="changeQty(\'' + p.name.replace(/'/g, "\\'") + '\',' + p.price + ',1)">+</button>' +
                '</div>' +
            '</div>';
        });
        html += '</div>';
    }

    section.innerHTML = html;
    renderReviewStars();
};

// ─────────────────────────────────────────────
// CART
// ─────────────────────────────────────────────
function changeQty(item, price, delta) {
    if (!cart[item]) cart[item] = { qty: 0, price: price };
    cart[item].qty += delta;
    if (cart[item].qty <= 0) delete cart[item];
    const el = document.getElementById("qty-" + item);
    if (el) el.textContent = cart[item] ? cart[item].qty : 0;
    saveCart();
    renderCart();
}
window.changeQty = changeQty;

function renderCart() {
    const cartList      = document.getElementById("cartList");
    const cartEmpty     = document.getElementById("cartEmpty");
    const cartSummaryBox= document.getElementById("cartSummaryBox");
    const cartActions   = document.getElementById("cartActions");
    if (!cartList) return;
    cartList.innerHTML  = "";

    const freeAbove = window.FREE_DELIVERY_ABOVE || 100;
    let subtotal    = 0;
    const items     = Object.keys(cart);

    if (items.length === 0) {
        if (cartEmpty)      cartEmpty.style.display      = "block";
        if (cartSummaryBox) cartSummaryBox.style.display = "none";
        if (cartActions)    cartActions.style.display    = "none";
    } else {
        if (cartEmpty)      cartEmpty.style.display      = "none";
        if (cartSummaryBox) cartSummaryBox.style.display = "block";
        if (cartActions)    cartActions.style.display    = "block";
        items.forEach(function(item) {
            const itemTotal = cart[item].price * cart[item].qty;
            subtotal += itemTotal;
            const li = document.createElement("li");
            li.innerHTML = '<span class="item-name">' + item + ' × ' + cart[item].qty + '</span>' +
                '<span class="item-price">₹' + itemTotal + '</span>' +
                '<button class="remove-btn" onclick="removeItem(\'' + item.replace(/'/g, "\\'") + '\')">✕</button>';
            cartList.appendChild(li);
        });
    }

    const delivery = subtotal > 0 && subtotal < freeAbove ? 10 : 0;
    const total    = subtotal + delivery;

    const se = document.getElementById("subtotal");       if (se) se.textContent = subtotal;
    const te = document.getElementById("total");          if (te) te.textContent = total;
    const dt = document.getElementById("deliveryText");
    if (dt) {
        if (delivery > 0)       { dt.textContent = "₹10"; dt.style.color = "#ef4444"; }
        else if (subtotal >= freeAbove) { dt.textContent = "FREE 🎉"; dt.style.color = "#16a34a"; }
        else                    { dt.textContent = "₹0"; dt.style.color = ""; }
    }
    const fn = document.getElementById("freeDeliveryNote");
    if (fn) {
        fn.style.display = delivery > 0 ? "block" : "none";
        const re = document.getElementById("remaining"); if (re) re.textContent = freeAbove - subtotal;
    }

    // Badge
    const totalQty = items.reduce(function(s, i) { return s + (cart[i] ? cart[i].qty : 0); }, 0);
    const nc = document.getElementById("navCartCount");
    if (nc) { nc.textContent = totalQty; nc.style.display = totalQty > 0 ? "inline" : "none"; }
}

function removeItem(item) {
    const el = document.getElementById("qty-" + item);
    if (el) el.textContent = "0";
    delete cart[item];
    saveCart(); renderCart();
}
window.removeItem = removeItem;

function clearCart() {
    showConfirm("🗑", "Clear Cart?", "All items will be removed.", function() {
        cart = {};
        document.querySelectorAll(".qty-display").forEach(function(el) { el.textContent = "0"; });
        saveCart(); renderCart();
    });
}
window.clearCart = clearCart;

function saveCart() {
    try { localStorage.setItem(cartKey(), JSON.stringify(cart)); } catch(e) {}
}

// ─────────────────────────────────────────────
// CART & CHECKOUT DRAWERS
// ─────────────────────────────────────────────
function openCart() {
    document.getElementById("cartOverlay").classList.add("open");
    document.getElementById("cartDrawer").classList.add("open");
    document.body.style.overflow = "hidden";
}
function closeCart() {
    document.getElementById("cartOverlay").classList.remove("open");
    document.getElementById("cartDrawer").classList.remove("open");
    document.body.style.overflow = "";
}
function goToCheckout() {
    if (Object.keys(cart).length === 0) { alert("Cart empty hai!"); return; }
    closeCart();
    updateCheckoutTotals();
    try {
        const user = JSON.parse(localStorage.getItem(userKey()));
        const n = document.getElementById("customerName");
        const p = document.getElementById("customerPhone");
        const a = document.getElementById("customerAddress");
        if (n && !n.value) n.value = user.name;
        if (p && !p.value) p.value = user.phone;
        if (a && !a.value) a.value = user.address;
    } catch(e) {}
    document.getElementById("checkoutOverlay").classList.add("open");
    document.getElementById("checkoutDrawer").classList.add("open");
    document.body.style.overflow = "hidden";
}
function closeCheckout() {
    document.getElementById("checkoutOverlay").classList.remove("open");
    document.getElementById("checkoutDrawer").classList.remove("open");
    document.body.style.overflow = "";
}
function updateCheckoutTotals() {
    const freeAbove = window.FREE_DELIVERY_ABOVE || 100;
    let subtotal = 0;
    for (let item in cart) subtotal += cart[item].price * cart[item].qty;
    const delivery = subtotal > 0 && subtotal < freeAbove ? 10 : 0;
    const total    = subtotal + delivery;
    const cs = document.getElementById("co-subtotal"); if (cs) cs.textContent = subtotal;
    const cd = document.getElementById("co-delivery"); if (cd) cd.textContent = delivery > 0 ? "₹" + delivery : "FREE 🎉";
    const ct = document.getElementById("co-total");    if (ct) ct.textContent = total;
}
window.openCart      = openCart;
window.closeCart     = closeCart;
window.goToCheckout  = goToCheckout;
window.closeCheckout = closeCheckout;

// ─────────────────────────────────────────────
// PLACE ORDER — WhatsApp + Firestore + history
// ─────────────────────────────────────────────
function placeOrder() {
    const name    = document.getElementById("customerName").value.trim();
    const phone   = document.getElementById("customerPhone").value.trim();
    const address = document.getElementById("customerAddress").value.trim();

    if (!name)    { alert("Please enter your name.");            return; }
    if (!phone)   { alert("Please enter your phone number.");    return; }
    if (!address) { alert("Please enter your delivery address."); return; }
    if (Object.keys(cart).length === 0) { alert("Cart empty hai!"); return; }

    const freeAbove     = window.FREE_DELIVERY_ABOVE || 100;
    const shopName      = (window.SHOP_DATA && window.SHOP_DATA.name) || "Shop";
    const shopPhone     = window.SHOP_PHONE || "";

    let subtotal = 0;
    for (let item in cart) subtotal += cart[item].price * cart[item].qty;
    const delivery     = subtotal < freeAbove ? 10 : 0;
    const total        = subtotal + delivery;
    const paymentEl    = document.querySelector('input[name="payment"]:checked');
    const paymentMethod= paymentEl ? paymentEl.value : "Cash on Delivery";

    const snap = JSON.parse(JSON.stringify(cart));

    // Save to localStorage history (scoped)
    saveOrderToHistory(name, phone, address, paymentMethod, subtotal, delivery, total, snap);

    // Save to Firestore (scoped to shop)
    if (typeof window._placeOrderFirebase === "function") {
        window._placeOrderFirebase({
            customerName: name, phone, address,
            payment: paymentMethod,
            items: snap, subtotal, delivery, total,
            status: "Placed"
        });
    }

    // Clear cart
    cart = {};
    document.querySelectorAll(".qty-display").forEach(function(el) { el.textContent = "0"; });
    saveCart(); renderCart(); closeCheckout();

    // WhatsApp message — uses shop's own phone
    let msg = "🛍 *New Order — " + shopName + "*\n\n";
    msg += "👤 *Name:* "    + name    + "\n";
    msg += "📞 *Phone:* "   + phone   + "\n";
    msg += "📍 *Address:* " + address + "\n";
    msg += "💳 *Payment:* " + paymentMethod + "\n\n*Order Items:*\n";
    for (let item in snap) {
        msg += "• " + item + " × " + snap[item].qty + " = ₹" + (snap[item].price * snap[item].qty) + "\n";
    }
    msg += "\n🚚 *Delivery:* " + (delivery > 0 ? "₹" + delivery : "FREE") + "\n";
    msg += "💰 *Grand Total: ₹" + total + "*";

    // Use shop's WhatsApp number from Firebase
    const waNumber = shopPhone ? "91" + shopPhone : "919321737571";
    window.open("https://wa.me/" + waNumber + "?text=" + encodeURIComponent(msg), "_blank");
}
window.placeOrder = placeOrder;

// ─────────────────────────────────────────────
// ORDER HISTORY  (scoped per shop)
// ─────────────────────────────────────────────
function saveOrderToHistory(name, phone, address, payment, subtotal, delivery, total, itemsSnap) {
    let history = [];
    try { const s = localStorage.getItem(historyKey()); if (s) history = JSON.parse(s); } catch(e) {}
    history.unshift({
        id: Date.now(),
        date: new Date().toLocaleString("en-IN"),
        name, phone, address, payment,
        items: itemsSnap,
        subtotal, delivery, total,
        status: "Placed"
    });
    if (history.length > 20) history = history.slice(0, 20);
    try { localStorage.setItem(historyKey(), JSON.stringify(history)); } catch(e) {}
}

// ─────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────
function showProfile() {
    try {
        const user = JSON.parse(localStorage.getItem(userKey()));
        document.getElementById("profileContent").innerHTML =
            '<div class="profile-info">' +
            '<div class="profile-row"><span>👤 Name</span><strong>'    + user.name    + '</strong></div>' +
            '<div class="profile-row"><span>📞 Phone</span><strong>+91 ' + user.phone + '</strong></div>' +
            '<div class="profile-row"><span>📍 Address</span><strong>' + user.address + '</strong></div>' +
            '</div>';
    } catch(e) {}
    const m = document.getElementById("profileModal");
    if (m) m.style.display = "flex";
}
function closeProfile() {
    const m = document.getElementById("profileModal"); if (m) m.style.display = "none";
}
function editProfile() {
    closeProfile();
    localStorage.removeItem(userKey());
    window.location.href = "login.html?shop=" + getShopId();
}
function logoutUser() {
    showConfirm("👋", "Logout?", "You will need to login again.", function() {
        localStorage.removeItem(userKey());
        window.location.href = "login.html?shop=" + getShopId();
    });
}
window.showProfile  = showProfile;
window.closeProfile = closeProfile;
window.editProfile  = editProfile;
window.logoutUser   = logoutUser;

// ─────────────────────────────────────────────
// REVIEWS  (scoped per shop)
// ─────────────────────────────────────────────
function renderReviewStars() {
    document.querySelectorAll(".product").forEach(function(card) {
        const name = card.getAttribute("data-name");
        if (!name) return;
        const reviews = reviewsData[name] || [];
        const avg     = reviews.length > 0
            ? (reviews.reduce(function(s,r){return s+r.stars;},0)/reviews.length).toFixed(1)
            : null;
        const ex = card.querySelector(".review-section"); if (ex) ex.remove();
        const div = document.createElement("div");
        div.className = "review-section";
        const starsHtml = avg
            ? '<div class="avg-stars">' + renderStarIcons(parseFloat(avg)) + ' <span>' + avg + '</span><small>(' + reviews.length + ')</small></div>'
            : '<div class="avg-stars no-review">No reviews yet</div>';
        div.innerHTML = starsHtml + '<button class="write-review-btn" onclick="openReviewModal(\'' + name.replace(/'/g,"\\'") + '\')">✍ Review</button>';
        card.appendChild(div);
    });
}
function renderStarIcons(rating) {
    let h = "";
    for (let i = 1; i <= 5; i++) {
        if (i <= Math.floor(rating)) h += '<span class="star filled">★</span>';
        else if (i - rating < 1)    h += '<span class="star half">★</span>';
        else                        h += '<span class="star empty">☆</span>';
    }
    return h;
}
function openReviewModal(name) {
    document.getElementById("reviewProductName").textContent = name;
    document.getElementById("reviewModalProduct").value = name;
    document.getElementById("reviewText").value = "";
    document.getElementById("reviewerName").value = "";
    setModalStars(0);
    document.getElementById("reviewModal").style.display = "flex";
}
function closeReviewModal() { document.getElementById("reviewModal").style.display = "none"; }

let selectedStars = 0;
function setModalStars(n) {
    selectedStars = n;
    document.querySelectorAll(".modal-star").forEach(function(s, i) { s.classList.toggle("selected", i < n); });
}
function submitReview() {
    const product = document.getElementById("reviewModalProduct").value;
    const text    = document.getElementById("reviewText").value.trim();
    const name    = document.getElementById("reviewerName").value.trim() || "Anonymous";
    if (selectedStars === 0) { alert("Please select a star rating!"); return; }
    if (!reviewsData[product]) reviewsData[product] = [];
    reviewsData[product].push({ stars: selectedStars, text, name, date: new Date().toLocaleDateString("en-IN") });
    try { localStorage.setItem(reviewsKey(), JSON.stringify(reviewsData)); } catch(e) {}
    closeReviewModal();
    renderReviewStars();
    alert("Thanks for your review! ⭐");
}
window.openReviewModal  = openReviewModal;
window.closeReviewModal = closeReviewModal;
window.setModalStars    = setModalStars;
window.submitReview     = submitReview;

// ─────────────────────────────────────────────
// VOICE SEARCH
// ─────────────────────────────────────────────
function startMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice search Chrome mein kaam karta hai!"); return; }
    const mic   = document.getElementById("micBtn");
    const input = document.getElementById("searchInput");
    const recognition = new SR();
    recognition.lang            = "en-IN";
    recognition.interimResults  = true;
    recognition.maxAlternatives = 5;
    mic.innerHTML = "🔴"; mic.style.background = "#ef4444";
    mic.style.animation = "micPulse 0.8s infinite";
    input.placeholder   = "Listening... बोलो या speak 🎤";
    input.value         = "";
    recognition.start();
    recognition.onresult = function(e) {
        let best = ""; let bestConf = 0;
        for (let i = e.resultIndex; i < e.results.length; i++) {
            for (let j = 0; j < e.results[i].length; j++) {
                if (e.results[i][j].confidence > bestConf) {
                    bestConf = e.results[i][j].confidence;
                    best     = e.results[i][j].transcript;
                }
            }
        }
        if (best) { input.value = best; input.dispatchEvent(new Event("input")); }
    };
    recognition.onend   = function() { mic.innerHTML = "<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>"; mic.style.background = "#f97316"; mic.style.animation = ""; input.placeholder = "Search products..."; };
    recognition.onerror = function() { mic.innerHTML = "<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>"; mic.style.background = "#f97316"; mic.style.animation = ""; input.placeholder = "Search products..."; };
}
window.startMic = startMic;

// ─────────────────────────────────────────────
// CONFIRM MODAL
// ─────────────────────────────────────────────
function showConfirm(icon, title, msg, onYes) {
    const modal = document.getElementById("confirmModal");
    if (!modal) { if (confirm(title + "\n" + msg)) onYes(); return; }
    document.getElementById("confirmIcon").textContent = icon;
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmMsg").textContent   = msg;
    modal.style.display = "flex";
    document.getElementById("confirmYesBtn").onclick = function() { closeConfirm(); onYes(); };
}
function closeConfirm() {
    const m = document.getElementById("confirmModal"); if (m) m.style.display = "none";
}
window.showConfirm  = showConfirm;
window.closeConfirm = closeConfirm;

// ─────────────────────────────────────────────
// IMAGE ZOOM
// ─────────────────────────────────────────────
function openZoom(src) {
    document.getElementById("zoomImg").src = src;
    document.getElementById("zoomOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
}
function closeZoom() {
    document.getElementById("zoomOverlay").classList.remove("open");
    document.body.style.overflow = "";
}
window.openZoom  = openZoom;
window.closeZoom = closeZoom;

document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") { closeZoom(); closeCart(); closeCheckout(); }
});