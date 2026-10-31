"use client";
/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UtensilsCrossed,
  Search,
  ShoppingBag,
  Plus,
  Minus,
  ArrowRight,
  Leaf,
  Clock,
  Star,
  LogOut,
  ChefHat,
  Check,
  Flame,
  Heart,
  UserRound,
} from "lucide-react";
import type {
  User,
  Menu,
  Category,
  CartLine,
  Custom,
  Review,
  Table,
} from "./types";
import {
  api,
  money,
  Modal,
  Empty,
  ErrorBox,
  Spinner,
  instructions,
  splitList,
} from "./shared";
import Reservations from "./Reservations";
import Orders from "./Orders";
import StaffDashboard from "./StaffDashboard";
import AdminDashboard from "./AdminDashboard";
import Preferences from "./Preferences";
const freshCustom = (): Custom => ({
  size: "Regular",
  crust: "Classic",
  extra_cheese: false,
  remove: [],
  add: [],
  special_instruction: "",
});
export default function RestaurantApp({ view }: { view: string }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null),
    [menu, setMenu] = useState<Menu[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [reviews, setReviews] = useState<Review[]>([]),
    [ratings, setRatings] = useState<
      { _id: number; rating: number; count: number }[]
    >([]),
    [cart, setCart] = useState<CartLine[]>([]),
    [hydrated, setHydrated] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [category, setCategory] = useState(0),
    [search, setSearch] = useState(""),
    [veg, setVeg] = useState(false),
    [dish, setDish] = useState<Menu | null>(null),
    [custom, setCustom] = useState<Custom>(freshCustom),
    [cartOpen, setCartOpen] = useState(false),
    [checkoutBusy, setCheckoutBusy] = useState(false),
    [tableId, setTableId] = useState(""),
    [reviewError, setReviewError] = useState(""),
    [diningTables, setDiningTables] = useState<Table[]>([]);
  const loadMenu = useCallback(async () => {
    const r = await api<{ items: Menu[]; categories: Category[] }>("menu");
    setMenu(r.items);
    setCategories(r.categories);
  }, []);
  useEffect(() => {
    Promise.all([
      api<{ user: User | null }>("auth/me").then((r) => setUser(r.user)),
      Promise.resolve().then(loadMenu),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    api<{
      reviews: Review[];
      averages: { _id: number; rating: number; count: number }[];
    }>("reviews")
      .then((r) => {
        setReviews(r.reviews);
        setRatings(r.averages);
      })
      .catch((e) => setReviewError(e.message));
    Promise.resolve().then(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("saffron-cart") || "[]");
        if (
          Array.isArray(saved) &&
          saved.every(
            (l) => l.item?.item_id && l.quantity > 0 && l.customizations,
          )
        )
          setCart(saved);
      } catch {
        /* Discard corrupted browser-only cart. */
      }
      setHydrated(true);
    });
  }, [loadMenu]);
  useEffect(() => {
    if (user?.role === "customer")
      api<{ tables: Table[] }>("tables/eligible")
        .then((r) => setDiningTables(r.tables))
        .catch((e) => setError(e.message));
  }, [user]);
  useEffect(() => {
    if (hydrated) localStorage.setItem("saffron-cart", JSON.stringify(cart));
  }, [cart, hydrated]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  function changeCart(next: CartLine[]) {
    setCart(next);
    localStorage.removeItem("saffron-checkout-key");
  }
  function addDish() {
    if (!dish) return;
    changeCart([
      ...cart,
      {
        key: crypto.randomUUID(),
        item: dish,
        quantity: 1,
        customizations: custom,
      },
    ]);
    setDish(null);
    setNotice("Added to your basket. A little happiness is on its way.");
  }
  async function checkout() {
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role !== "customer") {
      setError("Sign in with a customer account to place an order.");
      return;
    }
    setCheckoutBusy(true);
    setError("");
    try {
      let key = localStorage.getItem("saffron-checkout-key");
      if (!key) {
        key = crypto.randomUUID();
        localStorage.setItem("saffron-checkout-key", key);
      }
      const o = await api<{
        order_id: number;
        customizations_pending: boolean;
      }>("orders", "POST", {
        idempotency_key: key,
        table_id: tableId ? Number(tableId) : null,
        items: cart.map((l) => ({
          item_id: l.item.item_id,
          quantity: l.quantity,
          customizations: l.customizations,
        })),
      });
      changeCart([]);
      setCartOpen(false);
      setNotice(
        `Order #${o.order_id} placed${o.customizations_pending ? " · Kitchen instructions are safely queued for synchronization." : "."}`,
      );
      router.push("/orders");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCheckoutBusy(false);
    }
  }
  const total = cart.reduce((s, l) => s + Number(l.item.price) * l.quantity, 0),
    count = cart.reduce((s, l) => s + l.quantity, 0);
  const visible = menu.filter(
    (m) =>
      (!category || m.category_id === category) &&
      (!veg || m.vegetarian) &&
      `${m.item_name} ${m.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const cartPanel = (
    <>
      <div className="cart-heading">
        <div>
          <span className="eyebrow">SOMETHING DELICIOUS</span>
          <h2>
            Your basket <span className="count-pill">{count}</span>
          </h2>
        </div>
        <ShoppingBag size={23} />
      </div>
      {cart.length === 0 ? (
        <Empty title="A table for your cravings">
          <span>
            Pick a favourite from the menu.
            <br />
            We’ll take care of the rest.
          </span>
        </Empty>
      ) : (
        <>
          <div className="cart-lines">
            {cart.map((l) => (
              <div className="cart-line" key={l.key}>
                <div className="row between">
                  <b>{l.item.item_name}</b>
                  <span>{money(Number(l.item.price) * l.quantity)}</span>
                </div>
                {instructions(l.customizations) && (
                  <p>{instructions(l.customizations)}</p>
                )}
                <div className="quantity">
                  <button
                    aria-label={`Remove one ${l.item.item_name}`}
                    onClick={() =>
                      changeCart(
                        cart
                          .map((x) =>
                            x.key === l.key
                              ? { ...x, quantity: x.quantity - 1 }
                              : x,
                          )
                          .filter((x) => x.quantity > 0),
                      )
                    }
                  >
                    <Minus size={13} />
                  </button>
                  <span>{l.quantity}</span>
                  <button
                    disabled={l.quantity >= 99}
                    aria-label={`Add one ${l.item.item_name}`}
                    onClick={() =>
                      changeCart(
                        cart.map((x) =>
                          x.key === l.key
                            ? { ...x, quantity: x.quantity + 1 }
                            : x,
                        ),
                      )
                    }
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <label className="field compact">
            Dining option
            <select
              value={tableId}
              onChange={(e) => {
                setTableId(e.target.value);
                localStorage.removeItem("saffron-checkout-key");
              }}
            >
              <option value="">Takeaway</option>
              {diningTables.map((t) => (
                <option key={t.table_id} value={t.table_id}>
                  Dine-in · Table {t.table_number}
                </option>
              ))}
            </select>
          </label>
          {tableId && (
            <small>
              Staff must check you into your current reservation before ordering
              for a table.
            </small>
          )}
          <div className="cart-totals">
            <div className="row between">
              <span>Subtotal</span>
              <span>{money(total)}</span>
            </div>
            <div className="row between">
              <span>Additional charges</span>
              <span>₹0</span>
            </div>
            <div className="row between grand">
              <b>Total</b>
              <b>{money(total)}</b>
            </div>
          </div>
          <ErrorBox error={error} />
          <button
            className="button primary full"
            disabled={checkoutBusy}
            onClick={checkout}
          >
            {checkoutBusy
              ? "Placing your order…"
              : user
                ? "Place order"
                : "Sign in to order"}
            <ArrowRight size={17} />
          </button>
          <p className="cart-note">
            <Check size={13} />
            Prices verified by the kitchen at checkout.
          </p>
        </>
      )}
      <div className="cart-footnote">
        <Heart size={17} />
        <span>
          Made fresh. Served with love.
          <br />
          <small>All prices are in Indian rupees.</small>
        </span>
      </div>
    </>
  );
  return (
    <>
      <div className="announcement">
        A little spice. A lot of soul.{" "}
        <span>Your neighbourhood Indian kitchen.</span>
      </div>
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <UtensilsCrossed size={24} />
          </span>
          <span>
            saffron <em>&</em> sage<small>GOOD FOOD. GOOD COMPANY.</small>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link className={view === "menu" ? "active" : ""} href="/menu">
            Our menu
          </Link>
          <Link
            className={view === "reservations" ? "active" : ""}
            href="/reservations"
          >
            Reserve a table
          </Link>
          {user && (
            <Link className={view === "orders" ? "active" : ""} href="/orders">
              {user.role === "customer" ? "My orders" : "Orders"}
            </Link>
          )}
          {user?.role === "customer" && (
            <Link
              className={view === "preferences" ? "active" : ""}
              href="/preferences"
            >
              Preferences
            </Link>
          )}
          {user && user.role !== "customer" && (
            <Link className={view === "staff" ? "active" : ""} href="/staff">
              Kitchen
            </Link>
          )}
          {user?.role === "admin" && (
            <Link className={view === "admin" ? "active" : ""} href="/admin">
              Admin
            </Link>
          )}
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <span className="hello">
                <UserRound size={15} />
                {user.name.split(" ")[0]}
              </span>
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={async () => {
                  await api("auth/logout", "POST", {});
                  setUser(null);
                  router.push("/menu");
                  router.refresh();
                }}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <Link className="button outline small" href="/login">
              Sign in <ArrowRight size={15} />
            </Link>
          )}
          <button
            className="mobile-cart icon-button"
            aria-label="Open basket"
            onClick={() => setCartOpen(true)}
          >
            <ShoppingBag size={21} />
            {count > 0 && <span>{count}</span>}
          </button>
        </div>
      </header>
      <main>
        {view === "login" || view === "register" ? (
          <AuthForm
            register={view === "register"}
            onDone={async () => {
              const r = await api<{ user: User | null }>("auth/me");
              setUser(r.user);
              router.push(
                r.user?.role === "admin"
                  ? "/admin"
                  : r.user?.role === "staff"
                    ? "/staff"
                    : "/menu",
              );
              router.refresh();
            }}
          />
        ) : loading ? (
          <Spinner />
        ) : error && menu.length === 0 ? (
          <div className="page-container">
            <ErrorBox error={error} />
            <button
              className="button outline"
              onClick={() => location.reload()}
            >
              Retry connection
            </button>
          </div>
        ) : view === "menu" ? (
          <>
            <section className="hero">
              <div className="hero-content">
                <span className="eyebrow">
                  <span className="tiny-line" />
                  FRESH FROM OUR KITCHEN
                </span>
                <h1>
                  Come hungry.
                  <br />
                  Leave <em>happy.</em>
                </h1>
                <p>
                  Comforting classics, bold Indian flavours, and a little
                  <br className="desktop-only" /> something for every craving.
                  Made fresh, just for you.
                </p>
                <div className="hero-meta">
                  <span>
                    <Leaf size={16} />
                    Fresh ingredients
                  </span>
                  <span>
                    <Flame size={16} />
                    Authentic flavours
                  </span>
                  <span>
                    <Heart size={16} />
                    Made with care
                  </span>
                </div>
              </div>
              <div className="hero-visual">
                <img
                  src="/images/hero.jpg"
                  alt="A warmly prepared Indian meal"
                />
                <div className="hero-stamp">
                  <UtensilsCrossed size={21} />
                  <span>
                    FROM OUR
                    <br />
                    KITCHEN, WITH LOVE
                  </span>
                </div>
                <div className="hero-caption">
                  <span>THE HOUSE FAVOURITE</span>
                  <b>Good food brings us together.</b>
                </div>
              </div>
            </section>
            <div className="menu-layout">
              <section className="menu-main">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">A LITTLE OF EVERYTHING</span>
                    <h2>
                      Find your next favourite
                      <span className="orange-dot">.</span>
                    </h2>
                  </div>
                  <span className="menu-count">
                    {menu.length} dishes, endless happiness
                  </span>
                </div>
                <div className="menu-tools">
                  <label className="search">
                    <Search size={18} />
                    <input
                      aria-label="Search dishes"
                      placeholder="Search for a dish you love…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <button
                    className={"veg-toggle " + (veg ? "selected" : "")}
                    onClick={() => setVeg(!veg)}
                    aria-pressed={veg}
                  >
                    <Leaf size={16} />
                    Veg only <span className="switch" />
                  </button>
                </div>
                <div className="category-tabs" aria-label="Menu categories">
                  <button
                    className={category === 0 ? "selected" : ""}
                    onClick={() => setCategory(0)}
                  >
                    <UtensilsCrossed size={16} />
                    All dishes
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.category_id}
                      className={category === c.category_id ? "selected" : ""}
                      onClick={() => setCategory(c.category_id)}
                    >
                      {c.category_name}
                    </button>
                  ))}
                </div>
                <div className="dish-grid">
                  {visible.map((m, i) => {
                    const rating = ratings.find((r) => r._id === m.item_id);
                    return (
                      <article
                        className={
                          "dish-card " + (!m.availability ? "unavailable" : "")
                        }
                        key={m.item_id}
                      >
                        <button
                          className="dish-image"
                          onClick={() => {
                            setDish(m);
                            setCustom(freshCustom());
                          }}
                          aria-label={`View ${m.item_name}`}
                        >
                          <img
                            src={m.image}
                            alt={m.item_name}
                            loading={i < 3 ? "eager" : "lazy"}
                          />
                          {m.item_id === 1 && (
                            <span className="dish-tag">
                              <Flame size={12} />
                              Bestseller
                            </span>
                          )}
                          {!m.availability && (
                            <span className="dish-tag">Back soon</span>
                          )}
                          <span
                            className={
                              "diet-dot " + (!m.vegetarian ? "nonveg" : "")
                            }
                          >
                            <i />
                          </span>
                        </button>
                        <div className="dish-body">
                          <div className="row between">
                            <span className="dish-category">
                              {m.category.category_name}
                            </span>
                            {rating && (
                              <span className="rating">
                                <Star size={12} fill="currentColor" />
                                {rating.rating.toFixed(1)}
                                <small>({rating.count})</small>
                              </span>
                            )}
                          </div>
                          <h3>
                            <button
                              onClick={() => {
                                setDish(m);
                                setCustom(freshCustom());
                              }}
                            >
                              {m.item_name}
                            </button>
                          </h3>
                          <p>{m.description}</p>
                          <div className="row between dish-bottom">
                            <b>{money(m.price)}</b>
                            <button
                              className="add-button"
                              disabled={!m.availability}
                              aria-label={`Add ${m.item_name}`}
                              onClick={() => {
                                setDish(m);
                                setCustom(freshCustom());
                              }}
                            >
                              ADD <Plus size={15} />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {visible.length === 0 && (
                  <Empty title="No dishes found">
                    Try another search or category.
                  </Empty>
                )}
                <section className="review-section">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">AROUND OUR TABLE</span>
                      <h2>A few happy words.</h2>
                    </div>
                    <Star className="saffron" size={26} />
                  </div>
                  {reviewError ? (
                    <ErrorBox error={reviewError} />
                  ) : reviews.length === 0 ? (
                    <Empty title="Be our first reviewer">
                      Share a little love after your meal.
                    </Empty>
                  ) : (
                    <div className="review-grid">
                      {reviews.slice(0, 3).map((r) => (
                        <article className="review-card" key={r._id}>
                          <div className="stars">
                            {"★".repeat(r.rating)}
                            {"☆".repeat(5 - r.rating)}
                          </div>
                          <p>“{r.comment}”</p>
                          <b>{r.customer_name}</b>
                          <small>Verified guest · Order #{r.order_id}</small>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </section>
              <aside className="cart-panel">{cartPanel}</aside>
            </div>
          </>
        ) : view === "reservations" ? (
          <Reservations user={user} />
        ) : view === "orders" ? (
          <Orders user={user} />
        ) : view === "preferences" ? (
          <Preferences />
        ) : view === "staff" ? (
          <StaffDashboard user={user} />
        ) : view === "admin" ? (
          <AdminDashboard
            menu={menu}
            categories={categories}
            refreshMenu={loadMenu}
            user={user}
          />
        ) : null}
      </main>
      <footer className="site-footer">
        <Link href="/" className="brand footer-brand">
          <UtensilsCrossed size={20} />
          saffron & sage
        </Link>
        <p>Gather around. There’s always room for one more.</p>
        <span>
          <Clock size={14} />
          Open 24/7 · Every day
        </span>
        <small>PES University · Smart Restaurant Management System</small>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {cartOpen && (
        <Modal title="Your basket" onClose={() => setCartOpen(false)}>
          {cartPanel}
        </Modal>
      )}
      {dish && (
        <Modal title={dish.item_name} onClose={() => setDish(null)}>
          <img className="detail-image" src={dish.image} alt={dish.item_name} />
          <div className="row between">
            <span className="badge available">
              {dish.vegetarian ? "Vegetarian" : "Non-vegetarian"}
            </span>
            <b>{money(dish.price)}</b>
          </div>
          <p className="muted">{dish.description}</p>
          <h3>Make it yours</h3>
          <p className="fine-print">
            Customizations are included at the listed price. Each addition
            creates a separate order line.
          </p>
          <div className="form-grid">
            <label className="field">
              Size
              <select
                value={custom.size}
                onChange={(e) => setCustom({ ...custom, size: e.target.value })}
              >
                <option>Regular</option>
                <option>Large</option>
              </select>
            </label>
            <label className="field">
              Preparation
              <select
                value={custom.crust}
                onChange={(e) =>
                  setCustom({ ...custom, crust: e.target.value })
                }
              >
                <option value="Classic">Classic</option>
                <option value="Thin">Thin crust (where applicable)</option>
              </select>
            </label>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={custom.extra_cheese}
              onChange={(e) =>
                setCustom({ ...custom, extra_cheese: e.target.checked })
              }
            />
            Extra cheese (where applicable)
          </label>
          <div className="form-grid">
            <label className="field">
              Leave out
              <input
                placeholder="e.g. onions, olives"
                onChange={(e) =>
                  setCustom({ ...custom, remove: splitList(e.target.value) })
                }
              />
            </label>
            <label className="field">
              Add a little
              <input
                placeholder="e.g. coriander"
                onChange={(e) =>
                  setCustom({ ...custom, add: splitList(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="field">
            A note for the kitchen
            <textarea
              value={custom.special_instruction}
              maxLength={500}
              placeholder="Spice level, allergies, or anything we should know…"
              onChange={(e) =>
                setCustom({ ...custom, special_instruction: e.target.value })
              }
            />
          </label>
          <p className="fine-print">
            Please tell staff about any serious allergy before ordering.
          </p>
          <button
            className="button primary full"
            disabled={!dish.availability}
            onClick={addDish}
          >
            {dish.availability ? "Add to basket" : "Currently unavailable"}
            <Plus size={17} />
          </button>
          <h3 className="space-top">Guest reviews</h3>
          {reviews
            .filter((r) =>
              r.items_reviewed.some((i) => i.item_id === dish.item_id),
            )
            .map((r) => (
              <div className="mini-review" key={r._id}>
                <span className="stars">
                  {"★".repeat(
                    r.items_reviewed.find((i) => i.item_id === dish.item_id)!
                      .rating,
                  )}
                </span>
                <p>{r.comment}</p>
                <small>{r.customer_name}</small>
              </div>
            ))}
          {!reviews.some((r) =>
            r.items_reviewed.some((i) => i.item_id === dish.item_id),
          ) && <p className="muted">No reviews for this dish yet.</p>}
        </Modal>
      )}
    </>
  );
}
function AuthForm({
  register,
  onDone,
}: {
  register: boolean;
  onDone: () => Promise<void>;
}) {
  const [scope, setScope] = useState("customer"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="auth-layout">
      <div className="auth-story">
        <ChefHat size={40} />
        <span className="eyebrow">PULL UP A CHAIR</span>
        <h1>
          Great meals.
          <br />
          <em>Even better memories.</em>
        </h1>
        <p>
          Your favourite flavours, a familiar table,
          <br />
          and a kitchen that knows you.
        </p>
        <img
          src="/images/paneer.jpg"
          alt="Fresh Indian food from our kitchen"
        />
      </div>
      <div className="auth-form">
        <span className="eyebrow">WELCOME TO SAFFRON & SAGE</span>
        <h1>
          {register ? "Make yourself at home." : "Good to see you again."}
        </h1>
        <p className="muted">
          {register
            ? "A little about you, and we’ll get cooking."
            : "Sign in to your seat at the table."}
        </p>
        {!register && (
          <div className="segmented">
            <button
              className={scope === "customer" ? "selected" : ""}
              onClick={() => setScope("customer")}
            >
              I’m a guest
            </button>
            <button
              className={scope === "staff" ? "selected" : ""}
              onClick={() => setScope("staff")}
            >
              Restaurant team
            </button>
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            const f = new FormData(e.currentTarget);
            try {
              await api(
                register ? "auth/register" : "auth/login",
                "POST",
                register
                  ? {
                      name: f.get("name"),
                      email: f.get("email"),
                      phone: f.get("phone"),
                      password: f.get("password"),
                    }
                  : {
                      email: f.get("email"),
                      password: f.get("password"),
                      scope,
                    },
              );
              await onDone();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {register && (
            <label className="field">
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={100}
                placeholder="What should we call you?"
              />
            </label>
          )}
          <label className="field">
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>
          {register && (
            <label className="field">
              Phone number
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                pattern="\+?[0-9]{10,14}"
                required
                placeholder="10–14 digits"
              />
            </label>
          )}
          <label className="field">
            Password
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={register ? 10 : 1}
              maxLength={128}
              required
              placeholder={
                register ? "At least 10 characters" : "Your password"
              }
            />
          </label>
          <ErrorBox error={error} />
          <button className="button primary full" disabled={busy}>
            {busy ? "Just a moment…" : register ? "Create account" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="auth-switch">
          {register ? "Already a familiar face?" : "First time around?"}{" "}
          <Link href={register ? "/login" : "/register"}>
            {register ? "Sign in" : "Join our table"}
          </Link>
        </p>
        <p className="fine-print">
          Demo guest: <code>customer1@gmail.com</code> · Manager:{" "}
          <code>admin1@gmail.com</code>.<br />
          All demo accounts use <code>password@123</code>. Choose Restaurant
          team for staff or managers.
        </p>
      </div>
    </section>
  );
}
