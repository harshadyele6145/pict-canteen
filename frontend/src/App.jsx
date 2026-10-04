import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeCanvas } from "qrcode.react";

import {
  Search,
  ShoppingCart,
  Home,
  Utensils,
  ClipboardList,
  Plus,
  Minus,
  Clock,
  CheckCircle2,
  ChevronRight,
  LogOut,
  Trash2,
  X,
  CalendarClock,
  Zap,
  PackageCheck,
  RefreshCw,
  BarChart3,
} from "lucide-react";

import Login from "./LoginTemp.jsx";
import Register from "./RegisterTemp.jsx";
import "./App.css";

const API_URL = "http://localhost:5000";

function getIstMonthYear() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());

  return {
    month: Number(parts.find((part) => part.type === "month")?.value),
    year: Number(parts.find((part) => part.type === "year")?.value),
  };
}

function buildPickupQrValue(order) {
  return JSON.stringify({
    type: "PICT_CANTEEN_PICKUP",
    order_id: Number(order.id),
    pickup_token: String(order.pickup_token || "")
      .trim()
      .toUpperCase(),
  });
}

function formatTimeLabel(value) {
  if (!value) {
    return "";
  }

  const text = String(value);
  const match = text.match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return text;
  }

  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${hours}:${minutes} ${suffix}`;
}

function getCameraErrorMessage(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || error || "").toLowerCase();

  if (name === "InsecureContextError") {
    return "Camera scanning needs a secure origin. Use localhost or HTTPS.";
  }

  if (
    name === "NotAllowedError" ||
    message.includes("permission") ||
    message.includes("notallowed") ||
    message.includes("denied")
  ) {
    return "Camera permission was denied. Allow camera access and tap retry.";
  }

  if (
    name === "NotFoundError" ||
    message.includes("requested device not found") ||
    message.includes("no cameras") ||
    message.includes("camera not found")
  ) {
    return "No camera is available on this device.";
  }

  if (
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    message.includes("could not start video source")
  ) {
    return "The camera could not start. Close other apps or tabs using it, then retry.";
  }

  if (
    message.includes("insecure") ||
    message.includes("https") ||
    message.includes("secure origin")
  ) {
    return "Camera scanning needs a secure origin. Use localhost or HTTPS.";
  }

  return "Unable to start the camera. Please allow camera permission and try again.";
}

function mapPickupScanError(error) {
  if (!error.response) {
    return {
      title: "Network error",
      message: "Could not reach the server. Check your connection and try again.",
    };
  }

  const code = error.response?.data?.code;
  const message =
    error.response?.data?.message ||
    error.message ||
    "Pickup verification failed.";

  if (code === "ALREADY_PICKED_UP") {
    return {
      title: "Order Already Picked Up",
      message,
    };
  }

  if (code === "UNPAID") {
    return {
      title: "Payment Not Completed",
      message,
    };
  }

  if (code === "UNKNOWN_ORDER") {
    return {
      title: "Invalid Pickup QR",
      message: "Unknown order.",
    };
  }

  if (code === "INVALID_TOKEN") {
    return {
      title: "Invalid Pickup Token",
      message,
    };
  }

  if (code === "AMBIGUOUS_TOKEN") {
    return {
      title: "Token Verification Failed",
      message,
    };
  }

  return {
    title: "Invalid Pickup QR",
    message,
  };
}

function App() {
  // =========================================================
  // AUTH
  // =========================================================

  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("user");

      return savedUser
        ? JSON.parse(savedUser)
        : null;
    } catch {
      return null;
    }
  });

  const [authPage, setAuthPage] =
    useState("login");

  const [page, setPage] = useState(() => {
    try {
      const savedUser =
        localStorage.getItem("user");

      if (savedUser) {
        const parsedUser =
          JSON.parse(savedUser);

        return parsedUser.role === "admin"
          ? "admin"
          : "home";
      }
    } catch {
      return "home";
    }

    return "home";
  });

  // =========================================================
  // STUDENT STATE
  // =========================================================

  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedSlot, setSelectedSlot] =
    useState("");
  const [orderMode, setOrderMode] =
    useState("live");

  const [orderPlaced, setOrderPlaced] =
    useState(false);

  const [currentOrder, setCurrentOrder] =
    useState(null);

  const [studentOrders, setStudentOrders] =
    useState([]);

  const [paymentLoading, setPaymentLoading] =
    useState(false);

  // =========================================================
  // MENU
  // =========================================================

  const [menuItems, setMenuItems] =
    useState([]);

  const [menuLoading, setMenuLoading] =
    useState(true);

  // =========================================================
  // SLOTS
  // =========================================================

  const [slots, setSlots] = useState([]);

  const [slotsLoading, setSlotsLoading] =
    useState(true);

  // =========================================================
  // ADMIN
  // =========================================================

  const [adminOrders, setAdminOrders] =
    useState([]);

  const [
    adminOrdersLoading,
    setAdminOrdersLoading,
  ] = useState(false);

  const [stockUpdating, setStockUpdating] =
    useState({});

  const [pickupLoading, setPickupLoading] =
    useState(false);

  const [pickupTokenInput, setPickupTokenInput] =
    useState("");

  const [qrScannerOpen, setQrScannerOpen] =
    useState(false);

  const [qrScannerLoading, setQrScannerLoading] =
    useState(false);

  const [scannerError, setScannerError] =
    useState("");

  const [pickupScanResult, setPickupScanResult] =
    useState(null);

  const [analyticsOpen, setAnalyticsOpen] =
    useState(false);

  const [analyticsLoading, setAnalyticsLoading] =
    useState(false);

  const [analyticsMonth, setAnalyticsMonth] =
    useState(() => {
      const formatted = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
      }).format(new Date());

      return Number(formatted.split("-")[1]);
    });

  const [analyticsYear, setAnalyticsYear] =
    useState(() => {
      const formatted = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
      }).format(new Date());

      return Number(formatted.split("-")[0]);
    });

  const [monthlyAnalytics, setMonthlyAnalytics] =
    useState(null);

  const qrScannerRef = useRef(null);
  const scanInFlightRef = useRef(false);
  const compositionRef = useRef(false);

  useEffect(() => {
    return () => {
      const scanner = qrScannerRef.current;

      if (scanner) {
        scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              scanner.clear();
            } catch {}
          });
      }
    };
  }, []);

  // =========================================================
  // FETCH MENU
  // =========================================================

  const fetchMenu = async () => {
    try {
      setMenuLoading(true);

      const response = await axios.get(
        `${API_URL}/api/menu`
      );

      setMenuItems(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (error) {
      console.error(
        "Fetch menu error:",
        error
      );
    } finally {
      setMenuLoading(false);
    }
  };

  // =========================================================
  // FETCH SLOTS
  // =========================================================

  const fetchSlots = async () => {
    try {
      setSlotsLoading(true);

      const response = await axios.get(
        `${API_URL}/api/slots`
      );

      setSlots(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (error) {
      console.error(
        "Fetch slots error:",
        error
      );
    } finally {
      setSlotsLoading(false);
    }
  };

  // =========================================================
  // FETCH ADMIN ORDERS
  // =========================================================

  const fetchAdminOrders = async () => {
    if (user?.role !== "admin") {
      return;
    }

    try {
      setAdminOrdersLoading(true);

      const token =
        localStorage.getItem("token");

      const response = await axios.get(
        `${API_URL}/api/orders`,
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

      setAdminOrders(
        Array.isArray(response.data)
          ? response.data
          : response.data?.orders || []
      );
    } catch (error) {
      console.error(
        "Fetch admin orders error:",
        error
      );
    } finally {
      setAdminOrdersLoading(false);
    }
  };

  const fetchMonthlyAnalytics = async () => {
    if (user?.role !== "admin") {
      return;
    }

    try {
      setAnalyticsLoading(true);
      const token = localStorage.getItem("token");

      const response = await axios.get(
        `${API_URL}/api/analytics/monthly`,
        {
          params: {
            month: analyticsMonth,
            year: analyticsYear,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setMonthlyAnalytics(response.data || null);
    } catch (error) {
      console.error("Fetch analytics error:", error);
      setMonthlyAnalytics(null);
      alert(
        error.response?.data?.message ||
          "Failed to load monthly analytics."
      );
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // =========================================================
  // INITIAL LOAD
  // =========================================================

  useEffect(() => {
    fetchMenu();
    fetchSlots();
  }, []);

  useEffect(() => {
    if (user?.role === "admin") {
      fetchAdminOrders();
      if (analyticsOpen) {
        fetchMonthlyAnalytics();
      }
    }
  }, [user, analyticsOpen]);

  useEffect(() => {
    if (user?.role === "admin" && analyticsOpen) {
      fetchMonthlyAnalytics();
    }
  }, [analyticsMonth, analyticsYear, user?.role]);

  // =========================================================
  // SOCKET.IO
  // =========================================================

  useEffect(() => {
    const socket = io(API_URL);

    socket.on("connect", () => {
      console.log(
        "🟢 Socket connected:",
        socket.id
      );
    });

    socket.on("disconnect", () => {
      console.log(
        "🔴 Socket disconnected"
      );
    });

    socket.on("new_order", () => {
      fetchSlots();
      fetchMenu();

      if (user?.role === "admin") {
        fetchAdminOrders();
      }
    });

    socket.on(
      "menu_updated",
      (updatedItem) => {
        if (updatedItem?.id) {
          setMenuItems((previous) =>
            previous.map((item) =>
              Number(item.id) ===
              Number(updatedItem.id)
                ? {
                    ...item,
                    ...updatedItem,
                  }
                : item
            )
          );
        } else {
          fetchMenu();
        }
      }
    );

    socket.on(
      "order_completed",
      (updatedOrder) => {
        setCurrentOrder((previous) => {
          if (!previous) {
            return previous;
          }

          if (
            Number(updatedOrder?.id) ===
            Number(previous?.id)
          ) {
            return {
              ...previous,
              ...updatedOrder,
            };
          }

          return previous;
        });

        if (user?.role === "admin") {
          fetchAdminOrders();
        } else {
          setStudentOrders((previous) =>
            previous.map((order) =>
              Number(order.id) === Number(updatedOrder?.id)
                ? { ...order, ...updatedOrder }
                : order
            )
          );
        }
      }
    );

    return () => {
      socket.disconnect();
    };
  }, [user?.role]);

  // =========================================================
  // FOOD EMOJI
  // =========================================================

  const getFoodEmoji = (item) => {
    const name =
      item?.name?.toLowerCase() || "";

    const category =
      item?.category?.toLowerCase() || "";

    if (name.includes("dosa"))
      return "🥞";

    if (name.includes("thali"))
      return "🍛";

    if (name.includes("sandwich"))
      return "🥪";

    if (name.includes("noodle"))
      return "🍜";

    if (name.includes("samosa"))
      return "🥟";

    if (name.includes("tea"))
      return "☕";

    if (name.includes("coffee"))
      return "☕";

    if (category.includes("beverage"))
      return "🥤";

    if (category.includes("snack"))
      return "🍟";

    if (category.includes("south"))
      return "🥞";

    if (category.includes("chinese"))
      return "🍜";

    if (category.includes("meal"))
      return "🍛";

    return "🍽️";
  };

  // =========================================================
  // LOGIN
  // =========================================================

  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser);

    localStorage.setItem(
      "user",
      JSON.stringify(loggedInUser)
    );

    if (loggedInUser?.role === "admin") {
      setPage("admin");
    } else {
      setPage("home");
    }
  };

  // =========================================================
  // REGISTER
  // =========================================================

  const handleRegister = (
    registeredUser
  ) => {
    setUser(registeredUser);

    localStorage.setItem(
      "user",
      JSON.stringify(registeredUser)
    );

    setPage("home");
  };

  // =========================================================
  // LOGOUT
  // =========================================================

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setUser(null);
    setCart([]);
    setCurrentOrder(null);
    setOrderPlaced(false);
    setSelectedSlot("");

    setPage("home");
    setAuthPage("login");
  };

  // =========================================================
  // UPDATE STOCK
  // =========================================================

  const updateStock = async (
    menuId,
    newStock
  ) => {
    const stock = Number(newStock);

    if (
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      alert(
        "Stock must be a valid number greater than or equal to 0."
      );
      return;
    }

    try {
      setStockUpdating((previous) => ({
        ...previous,
        [menuId]: true,
      }));

      const token =
        localStorage.getItem("token");

      const response = await axios.put(
        `${API_URL}/api/menu/${menuId}/stock`,
        {
          stock,
        },
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

      const updatedItem =
        response.data?.item;

      if (updatedItem) {
        setMenuItems((previous) =>
          previous.map((item) =>
            Number(item.id) ===
            Number(updatedItem.id)
              ? updatedItem
              : item
          )
        );
      }
    } catch (error) {
      console.error(
        "Update stock error:",
        error
      );

      alert(
        error.response?.data?.message ||
          "Failed to update stock."
      );
    } finally {
      setStockUpdating((previous) => ({
        ...previous,
        [menuId]: false,
      }));
    }
  };

  // =========================================================
  // UPDATE AVAILABILITY
  // =========================================================

  const updateAvailability = async (
    menuId,
    available
  ) => {
    try {
      setStockUpdating((previous) => ({
        ...previous,
        [menuId]: true,
      }));

      const token =
        localStorage.getItem("token");

      const response = await axios.put(
        `${API_URL}/api/menu/${menuId}/availability`,
        {
          available,
        },
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

      const updatedItem =
        response.data?.item;

      if (updatedItem) {
        setMenuItems((previous) =>
          previous.map((item) =>
            Number(item.id) ===
            Number(updatedItem.id)
              ? updatedItem
              : item
          )
        );
      }
    } catch (error) {
      console.error(
        "Availability update error:",
        error
      );

      alert(
        error.response?.data?.message ||
          "Failed to update availability."
      );
    } finally {
      setStockUpdating((previous) => ({
        ...previous,
        [menuId]: false,
      }));
    }
  };
    // =========================================================
  // CART
  // =========================================================

  const addToCart = (item) => {
    if (!item.available) {
      alert(
        `${item.name} is currently unavailable.`
      );
      return;
    }

    const stock = Number(
      item.stock || 0
    );

    if (stock <= 0) {
      alert(
        `${item.name} is out of stock.`
      );
      return;
    }

    setCart((previous) => {
      const existing = previous.find(
        (cartItem) =>
          Number(cartItem.id) ===
          Number(item.id)
      );

      if (existing) {
        if (
          Number(existing.quantity) >=
          stock
        ) {
          alert(
            `Only ${stock} ${item.name} available.`
          );

          return previous;
        }

        return previous.map(
          (cartItem) =>
            Number(cartItem.id) ===
            Number(item.id)
              ? {
                  ...cartItem,
                  quantity:
                    cartItem.quantity + 1,
                }
              : cartItem
        );
      }

      return [
        ...previous,
        {
          ...item,
          quantity: 1,
        },
      ];
    });
  };

  // =========================================================
  // DECREASE
  // =========================================================

  const decreaseQuantity = (itemId) => {
    setCart((previous) =>
      previous
        .map((item) =>
          Number(item.id) ===
          Number(itemId)
            ? {
                ...item,
                quantity:
                  item.quantity - 1,
              }
            : item
        )
        .filter(
          (item) => item.quantity > 0
        )
    );
  };

  // =========================================================
  // INCREASE
  // =========================================================

  const increaseQuantity = (itemId) => {
    setCart((previous) =>
      previous.map((item) => {
        if (
          Number(item.id) !==
          Number(itemId)
        ) {
          return item;
        }

        const currentMenuItem =
          menuItems.find(
            (menuItem) =>
              Number(menuItem.id) ===
              Number(itemId)
          );

        const stock = Number(
          currentMenuItem?.stock ||
            item.stock ||
            0
        );

        if (
          Number(item.quantity) >=
          stock
        ) {
          alert(
            `Only ${stock} ${item.name} available.`
          );

          return item;
        }

        return {
          ...item,
          quantity:
            item.quantity + 1,
        };
      })
    );
  };

  // =========================================================
  // REMOVE
  // =========================================================

  const removeFromCart = (itemId) => {
    setCart((previous) =>
      previous.filter(
        (item) =>
          Number(item.id) !==
          Number(itemId)
      )
    );
  };

  // =========================================================
  // TOTAL
  // =========================================================

  const total = cart.reduce(
    (sum, item) =>
      sum +
      Number(item.price || 0) *
        Number(item.quantity || 0),
    0
  );

  // =========================================================
  // FILTER MENU
  // =========================================================

  const filteredItems =
    menuItems.filter((item) => {
      const query = search
        .trim()
        .toLowerCase();

      if (!query) return true;

      return (
        item.name
          ?.toLowerCase()
          .includes(query) ||
        item.category
          ?.toLowerCase()
          .includes(query) ||
        item.description
          ?.toLowerCase()
          .includes(query)
      );
    });

  // =========================================================
  // TIME HELPERS
  // =========================================================

  const getCurrentTimeInMinutes =
    () => {
      const now = new Date();

      return (
        now.getHours() * 60 +
        now.getMinutes()
      );
    };

  const timeToMinutes = (value) => {
    if (!value) return 0;

    const parts =
      String(value).split(":");

    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);

    return hours * 60 + minutes;
  };

  // =========================================================
  // AVAILABLE SLOTS
  // =========================================================

  const availableSlots =
    slots.filter((slot) => {
      if (slot.available !== true) {
        return false;
      }

      if (Number(slot.remaining) <= 0) {
        return false;
      }

      const currentMinutes =
        getCurrentTimeInMinutes();

      const slotStart =
        timeToMinutes(
          slot.start_time
        );

      return slotStart > currentMinutes;
    });

  // =========================================================
  // ORDER MODE
  // =========================================================

  const changeOrderMode = (mode) => {
    setOrderMode(mode);
    setSelectedSlot("");
  };

  // =========================================================
  // SLOT DISPLAY
  // =========================================================

  const formatSlotTime = (slot) => {
    if (slot?.slot_time) {
      return slot.slot_time;
    }

    if (
      slot?.start_time &&
      slot?.end_time
    ) {
      return `${slot.start_time} - ${slot.end_time}`;
    }

    return "Pickup slot";
  };

  // =========================================================
  // VALIDATE STOCK
  // =========================================================

  const validateCartStock = () => {
    for (const cartItem of cart) {
      const currentItem =
        menuItems.find(
          (item) =>
            Number(item.id) ===
            Number(cartItem.id)
        );

      if (!currentItem) {
        alert(
          `${cartItem.name} is no longer available.`
        );

        return false;
      }

      if (currentItem.available !== true) {
        alert(
          `${cartItem.name} is currently unavailable.`
        );

        return false;
      }

      const stock = Number(
        currentItem.stock || 0
      );

      if (
        Number(cartItem.quantity) >
        stock
      ) {
        alert(
          `${cartItem.name} has only ${stock} left.`
        );

        return false;
      }
    }

    return true;
  };

  // =========================================================
  // RAZORPAY
  // =========================================================

  const loadRazorpay = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }

      const script =
        document.createElement("script");

      script.src =
        "https://checkout.razorpay.com/v1/checkout.js";

      script.onload = () =>
        resolve(true);

      script.onerror = () =>
        resolve(false);

      document.body.appendChild(script);
    });
  };

  // =========================================================
  // CREATE PAYMENT ORDER
  // =========================================================

  const createPaymentOrder =
    async () => {
      const token =
        localStorage.getItem("token");

      const response = await axios.post(
        `${API_URL}/api/payments/create-order`,
        {
          user_id: user.id,

          slot_id:
            orderMode === "preorder"
              ? Number(selectedSlot)
              : null,

          order_mode: orderMode,

          items: cart.map((item) => ({
            menu_item_id:
              Number(item.id),

            quantity:
              Number(item.quantity),
          })),
        },
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

      return response.data;
    };

  // =========================================================
  // VERIFY PAYMENT
  // =========================================================

  const verifyPayment = async (
    paymentOrder,
    razorpayResponse
  ) => {
    const token =
      localStorage.getItem("token");

    const response = await axios.post(
      `${API_URL}/api/payments/verify`,
      {
        order_id:
          paymentOrder.order_id,

        razorpay_order_id:
          razorpayResponse.razorpay_order_id,

        razorpay_payment_id:
          razorpayResponse.razorpay_payment_id,

        razorpay_signature:
          razorpayResponse.razorpay_signature,
      },
      {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      }
    );

    return response.data;
  };

  // =========================================================
  // PLACE ORDER
  // =========================================================

  const placeOrder = async () => {
    if (!user) {
      alert("Please login first.");
      return;
    }

    if (user.role === "admin") {
      return;
    }

    if (cart.length === 0) {
      alert(
        "Please add items to your cart."
      );
      return;
    }

    if (
      orderMode === "preorder" &&
      !selectedSlot
    ) {
      alert(
        "Please select a pickup slot for preorder."
      );
      return;
    }

    if (!validateCartStock()) {
      await fetchMenu();
      return;
    }

    try {
      setPaymentLoading(true);

      const razorpayLoaded =
        await loadRazorpay();

      if (!razorpayLoaded) {
        alert(
          "Razorpay could not be loaded."
        );

        setPaymentLoading(false);
        return;
      }

      const paymentOrder =
        await createPaymentOrder();

      const options = {
        key:
          paymentOrder.key_id ||
          import.meta.env
            .VITE_RAZORPAY_KEY_ID,

        amount:
          paymentOrder.amount,

        currency:
          paymentOrder.currency ||
          "INR",

        name: "PICT Canteen",

        description:
          "Canteen Food Order",

        order_id:
          paymentOrder.gateway_order_id ||
          paymentOrder.razorpay_order_id,

        prefill: {
          name: user.name,
          email: user.email,
        },

        theme: {
          color: "#111827",
        },

        handler: async (
          razorpayResponse
        ) => {
          try {
            const verifiedOrder =
              await verifyPayment(
                paymentOrder,
                razorpayResponse
              );

            if (
              !verifiedOrder?.success
            ) {
              alert(
                "Payment verification failed."
              );

              setPaymentLoading(false);
              return;
            }

            const successfulOrder = {
              id:
                verifiedOrder.order_id,

              user_id: user.id,

              slot_id:
                verifiedOrder.slot_id ?? null,

              total_amount:
                verifiedOrder.total_amount ??
                total,

              status: "PLACED",

              payment_status: "PAID",

              order_mode:
                verifiedOrder.order_mode ??
                orderMode,

              pickup_token:
                verifiedOrder.pickup_token,

              created_at:
                new Date().toISOString(),
            };

            setCurrentOrder(
              successfulOrder
            );

            setStudentOrders(
              (previous) => [
                successfulOrder,
                ...previous,
              ]
            );

            setOrderPlaced(true);
            setCart([]);
            setSelectedSlot("");
            setPaymentLoading(false);

            await fetchMenu();
            await fetchSlots();

            alert(
              `Payment successful!\n\nPickup Token: ${
                verifiedOrder.pickup_token ||
                "Generated"
              }`
            );

            setPage("orders");
          } catch (error) {
            console.error(
              "Payment verification error:",
              error
            );

            alert(
              error.response?.data
                ?.message ||
                "Payment verification failed."
            );

            setPaymentLoading(false);
          }
        },

        modal: {
          ondismiss: () => {
            setPaymentLoading(false);
          },
        },
      };

      const razorpayCheckout =
        new window.Razorpay(options);

      razorpayCheckout.on(
        "payment.failed",
        (response) => {
          alert(
            response.error
              ?.description ||
              "Payment failed."
          );

          setPaymentLoading(false);
        }
      );

      razorpayCheckout.open();
    } catch (error) {
      console.error(
        "Create payment order error:",
        error
      );

      alert(
        error.response?.data
          ?.message ||
          error.message ||
          "Unable to start payment."
      );

      setPaymentLoading(false);
    }
  };
    // =========================================================
  // FETCH SINGLE ORDER
  // =========================================================

  const fetchOrder = async (orderId) => {
    if (!orderId) return;

    try {
      const token =
        localStorage.getItem("token");

      const response = await axios.get(
        `${API_URL}/api/orders/${orderId}`,
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

      setCurrentOrder(
        response.data?.order ||
          response.data
      );
    } catch (error) {
      console.error(
        "Fetch order error:",
        error
      );
    }
  };

  // =========================================================
  // FETCH STUDENT ORDERS
  // =========================================================

  const fetchStudentOrders =
    async () => {
      if (
        !user ||
        user.role === "admin"
      ) {
        return;
      }

      try {
        const token =
          localStorage.getItem(
            "token"
          );

        const response =
          await axios.get(
            `${API_URL}/api/orders/user/${user.id}`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          );

        const orders =
          Array.isArray(
            response.data
          )
            ? response.data
            : response.data?.orders ||
              [];

        setStudentOrders(orders);

        if (orders.length > 0) {
          setCurrentOrder(
            orders[0]
          );

          setOrderPlaced(true);
        } else {
          setCurrentOrder(null);
          setOrderPlaced(false);
        }
      } catch (error) {
        console.error(
          "Fetch student orders error:",
          error
        );
      }
    };

  useEffect(() => {
    if (
      user &&
      user.role !== "admin"
    ) {
      fetchStudentOrders();
    }
  }, [user]);

  // =========================================================
  // QR PICKUP SCANNER
  // =========================================================

  const stopQrScanner = async () => {
    const scanner = qrScannerRef.current;

    if (!scanner) {
      setQrScannerOpen(false);
      setQrScannerLoading(false);
      return;
    }

    try {
      await scanner.stop();
    } catch (error) {
      console.error("QR scanner stop error:", error);
    }

    try {
      scanner.clear();
    } catch {}

    qrScannerRef.current = null;
    setQrScannerOpen(false);
    setQrScannerLoading(false);
  };

  const verifyScannedQr = async (decodedText) => {
    try {
      setPickupLoading(true);
      setScannerError("");

      const authToken = localStorage.getItem("token");

      const response = await axios.post(
        `${API_URL}/api/orders/scan-qr`,
        { qr: decodedText },
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      const completedOrder =
        response.data?.order || response.data;

      setPickupScanResult({
        ok: true,
        ...completedOrder,
        status: "COMPLETED",
        payment_status: "PAID",
      });

      await fetchAdminOrders();
      await stopQrScanner();
      return true;
    } catch (error) {
      console.error("QR pickup scan error:", error);

      const mapped = mapPickupScanError(error);

      setPickupScanResult({
        ok: false,
        title: mapped.title,
        message: mapped.message,
      });

      setScannerError(mapped.title);
      return false;
    } finally {
      setPickupLoading(false);
      scanInFlightRef.current = false;
    }
  };

  const verifyPickupToken = async (event) => {
    event.preventDefault();

    const pickupToken = pickupTokenInput.trim().toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(pickupToken)) {
      setPickupScanResult({
        ok: false,
        title: "Invalid Pickup Token",
        message: "Enter the student's 6-character pickup token.",
      });
      return;
    }

    try {
      setPickupLoading(true);
      setScannerError("");

      const authToken = localStorage.getItem("token");
      const response = await axios.post(
        `${API_URL}/api/orders/pickup-token`,
        { pickup_token: pickupToken },
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      const completedOrder = response.data?.order || response.data;
      setPickupScanResult({
        ok: true,
        ...completedOrder,
        status: "COMPLETED",
        payment_status: "PAID",
      });
      setPickupTokenInput("");
      await fetchAdminOrders();
    } catch (error) {
      console.error("Pickup token verification error:", error);
      const mapped = mapPickupScanError(error);
      setPickupScanResult({
        ok: false,
        title: mapped.title,
        message: mapped.message,
      });
    } finally {
      setPickupLoading(false);
    }
  };

  const verifyScannedQrRef = useRef(verifyScannedQr);
  verifyScannedQrRef.current = verifyScannedQr;

  useEffect(() => {
    if (!qrScannerOpen) {
      return undefined;
    }

    let cancelled = false;

    const bootScanner = async () => {
      if (qrScannerRef.current) {
        return;
      }

      setQrScannerLoading(true);

      const reader = document.getElementById("pickup-qr-reader");

      if (!reader) {
        setScannerError("Scanner could not start. Please try again.");
        setQrScannerLoading(false);
        setQrScannerOpen(false);
        return;
      }

      try {
        if (
          !window.isSecureContext ||
          !navigator.mediaDevices?.getUserMedia
        ) {
          throw Object.assign(
            new Error("Camera access requires a secure browser context."),
            { name: "InsecureContextError" }
          );
        }

        const cameras = await Html5Qrcode.getCameras();

        if (cancelled) {
          return;
        }

        if (!cameras || cameras.length === 0) {
          throw new Error("No cameras found");
        }

        const rearCamera = cameras.find((camera) =>
          /back|rear|environment/i.test(camera.label || "")
        );
        const isMobileDevice =
          /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const preferredCamera = isMobileDevice
          ? rearCamera?.id
          : cameras[0]?.id;

        const cameraSources = [
          ...(preferredCamera
            ? [preferredCamera]
            : [{ facingMode: { ideal: "environment" } }]),
          ...cameras
            .map((camera) => camera.id)
            .filter((cameraId) => cameraId !== preferredCamera),
          ...(isMobileDevice && !rearCamera
            ? [{ facingMode: { ideal: "environment" } }]
            : []),
        ];
        const scannerConfig = {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const edge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.min(edge, Math.max(180, Math.floor(edge * 0.72)));
            return { width: size, height: size };
          },
        };
        let lastCameraError;

        for (const cameraSource of cameraSources) {
          const scanner = new Html5Qrcode("pickup-qr-reader");
          qrScannerRef.current = scanner;

          try {
            await scanner.start(
              cameraSource,
              scannerConfig,
              async (decodedText) => {
                if (scanInFlightRef.current) {
                  return;
                }

                scanInFlightRef.current = true;
                setScannerError("");

                let parsed = null;

                try {
                  parsed = JSON.parse(decodedText);
                } catch {
                  setPickupScanResult({
                    ok: false,
                    title: "Invalid Pickup QR",
                    message: "This QR is not a PICT Canteen pickup code.",
                  });
                  setScannerError("Invalid Pickup QR");
                  scanInFlightRef.current = false;
                  return;
                }

                if (
                  parsed?.type !== "PICT_CANTEEN_PICKUP" ||
                  !parsed?.order_id ||
                  !parsed?.pickup_token
                ) {
                  setPickupScanResult({
                    ok: false,
                    title: "Invalid Pickup QR",
                    message: "Unsupported QR payload.",
                  });
                  setScannerError("Invalid Pickup QR");
                  scanInFlightRef.current = false;
                  return;
                }

                await verifyScannedQrRef.current(decodedText);
              },
              () => {}
            );

            break;
          } catch (error) {
            lastCameraError = error;
            qrScannerRef.current = null;

            try {
              if (scanner.isScanning) {
                await scanner.stop();
              }
              scanner.clear();
            } catch (cleanupError) {
              console.error("QR scanner cleanup error:", cleanupError);
            }
          }
        }

        if (!qrScannerRef.current) {
          throw lastCameraError || new Error("Unable to start any available camera.");
        }

        if (!cancelled) {
          setQrScannerLoading(false);
        }
      } catch (error) {
        console.error("QR scanner start error:", error);

        if (!cancelled) {
          qrScannerRef.current = null;
          setQrScannerOpen(false);
          setQrScannerLoading(false);
          setScannerError(getCameraErrorMessage(error));
        }
      }
    };

    bootScanner();

    return () => {
      cancelled = true;
    };
  }, [qrScannerOpen]);

  const startQrScanner = () => {
    if (qrScannerRef.current || qrScannerLoading || qrScannerOpen) {
      return;
    }

    scanInFlightRef.current = false;
    setPickupScanResult(null);
    setScannerError("");
    setQrScannerOpen(true);
  };

  // =========================================================
  // ORDER MODE LABEL
  // =========================================================

  const getOrderModeLabel = (
    mode
  ) => {
    return mode === "preorder"
      ? "Preorder"
      : "Live Order";
  };

  const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString(
      "en-IN",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )}`;

  const getMonthName = (month) =>
    new Date(2024, month - 1, 1).toLocaleString(
      "en-IN",
      {
        month: "long",
      }
    );

  // =========================================================
  // AUTH SCREEN
  // =========================================================

  if (!user) {
    return (
      <div className="app">

        {authPage === "login" ? (
          <Login
            onLogin={handleLogin}
            onSwitch={() =>
              setAuthPage(
                "register"
              )
            }
          />
        ) : (
          <Register
            onRegister={
              handleRegister
            }
            onSwitch={() =>
              setAuthPage(
                "login"
              )
            }
          />
        )}

      </div>
    );
  }

  // =========================================================
  // ADMIN NAVBAR
  // =========================================================

  const AdminNavbar = () => {
    return (
      <nav className="navbar">

        <div className="navbar-brand">

          <div className="brand-icon">
            <Utensils size={21} />
          </div>

          <div>
            <div className="brand-title">
              PICT Canteen
            </div>

            <span className="brand-subtitle">
              Admin Panel
            </span>
          </div>

        </div>

        <div className="navbar-actions">

          <button
            className="nav-btn active"
            onClick={() =>
              setPage("admin")
            }
          >
            <Utensils size={18} />
            <span>Dashboard</span>
          </button>

          <button
            className="nav-btn"
            onClick={logout}
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>

        </div>

      </nav>
    );
  };

  // =========================================================
  // STUDENT NAVBAR
  // =========================================================

  const StudentNavbar = () => {
    return (
      <nav className="navbar">

        <div
          className="navbar-brand"
          onClick={() =>
            setPage("home")
          }
        >

          <div className="brand-icon">
            <Utensils size={21} />
          </div>

          <div>
            <div className="brand-title">
              PICT Canteen
            </div>

            <span className="brand-subtitle">
              Smart. Fast. Fresh.
            </span>
          </div>

        </div>

        <div className="navbar-actions">

          <button
            className={`nav-btn ${
              page === "home"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setPage("home")
            }
          >
            <Home size={18} />
            <span>Home</span>
          </button>

          <button
            className={`nav-btn ${
              page === "menu"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setPage("menu")
            }
          >
            <Utensils size={18} />
            <span>Menu</span>
          </button>

          <button
            className={`nav-btn ${
              page === "orders"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setPage("orders")
            }
          >
            <ClipboardList size={18} />
            <span>Orders</span>
          </button>

          <button
            className={`nav-btn ${
              page === "cart"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setPage("cart")
            }
          >
            <ShoppingCart size={18} />

            <span>Cart</span>

            {cart.length > 0 && (
              <span className="cart-count">
                {cart.reduce(
                  (sum, item) =>
                    sum +
                    Number(
                      item.quantity
                    ),
                  0
                )}
              </span>
            )}
          </button>

          <button
            className="nav-btn"
            onClick={logout}
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>

        </div>

      </nav>
    );
  };

  // =========================================================
  // HOME PAGE
  // =========================================================

  const HomePage = () => {
    return (
      <>
        <section className="hero-section">

          <div className="hero-content">

            <div className="hero-badge">
              <Zap size={15} />
              PICT Canteen
            </div>

            <h1>
              Good food.
              <br />
              <span>
                Zero waiting.
              </span>
            </h1>

            <p>
              Order your favorite
              canteen food, select
              today's pickup slot,
              pay securely and collect
              your order without
              standing in a long queue.
            </p>

            <div className="hero-actions">

              <button
                className="primary-btn"
                onClick={() =>
                  setPage("menu")
                }
              >
                Order Food
                <ChevronRight size={18} />
              </button>

              <button
                className="secondary-btn"
                onClick={() =>
                  setPage("orders")
                }
              >
                <ClipboardList
                  size={17}
                />
                My Orders
              </button>

            </div>

          </div>

          <div className="hero-visual">

            <div className="hero-food">
              🍛
            </div>

            <div className="hero-food-small one">
              🥪
            </div>

            <div className="hero-food-small two">
              ☕
            </div>

            <div className="hero-food-small three">
              🥟
            </div>

          </div>

        </section>

        <section className="quick-section">

          <h2>
            How it works
          </h2>

          <div className="quick-grid">

            <div className="quick-card">
              <Utensils size={24} />

              <h3>
                Choose Food
              </h3>

              <p>
                Browse the live
                canteen menu and add
                your favorite items.
              </p>
            </div>

            <div className="quick-card">
              <CalendarClock
                size={24}
              />

              <h3>
                Pick a Slot
              </h3>

              <p>
                Select today's
                convenient pickup
                time.
              </p>
            </div>

            <div className="quick-card">
              <PackageCheck
                size={24}
              />

              <h3>
                Collect
              </h3>

              <p>
                Show your pickup
                token and collect
                your paid order.
              </p>
            </div>

          </div>

        </section>
      </>
    );
  };
    // =========================================================
  // MENU PAGE
  // =========================================================

  const MenuPage = () => {
    return (
      <main className="page-container">

        <div className="page-header">

          <div>
            <h1>
              Today's Menu
            </h1>

            <p>
              Fresh food available
              at the PICT canteen.
            </p>
          </div>

          <div className="search-box">

            <Search size={18} />

            <input
              type="text"
              placeholder="Search food..."
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
            />

            {search && (
              <button
                className="text-danger-btn"
                onClick={() =>
                  setSearch("")
                }
              >
                <X size={16} />
              </button>
            )}

          </div>

        </div>

        {menuLoading ? (
          <div className="loading-state">
            Loading menu...
          </div>
        ) : filteredItems.length ===
          0 ? (
          <div className="empty-state">

            <Utensils size={42} />

            <h3>
              No food found
            </h3>

            <p>
              Try another search.
            </p>

          </div>
        ) : (
          <div className="menu-grid">

            {filteredItems.map(
              (item) => {

                const stock = Number(
                  item.stock || 0
                );

                const unavailable =
                  item.available !==
                    true ||
                  stock <= 0;

                const cartItem =
                  cart.find(
                    (cartItem) =>
                      Number(
                        cartItem.id
                      ) ===
                      Number(item.id)
                  );

                return (
                  <div
                    className={`food-card ${
                      unavailable
                        ? "unavailable"
                        : ""
                    }`}
                    key={item.id}
                  >

                    <div className="food-image">
                      {getFoodEmoji(item)}
                    </div>

                    <div className="food-info">

                      <span className="food-category">
                        {item.category ||
                          "Canteen"}
                      </span>

                      <h3>
                        {item.name}
                      </h3>

                      <p>
                        {item.description ||
                          "Freshly prepared at PICT Canteen."}
                      </p>

                      <div className="food-footer">

                        <span className="food-price">
                          ₹
                          {Number(
                            item.price || 0
                          ).toFixed(2)}
                        </span>

                        <span
                          className={
                            stock > 0 &&
                            item.available
                              ? "stock-badge"
                              : "stock-badge out"
                          }
                        >
                          {stock > 0 &&
                          item.available
                            ? `${stock} left`
                            : "Unavailable"}
                        </span>

                      </div>

                      <button
                        className="add-food-btn"
                        disabled={
                          unavailable
                        }
                        onClick={() =>
                          addToCart(item)
                        }
                      >
                        <Plus size={17} />

                        {cartItem
                          ? `Add More (${cartItem.quantity})`
                          : "Add to Cart"}
                      </button>

                    </div>

                  </div>
                );
              }
            )}

          </div>
        )}

      </main>
    );
  };

  // =========================================================
  // CART PAGE
  // =========================================================

  const CartPage = () => {
    return (
      <main className="page-container">

        <div className="page-header">

          <div>
            <h1>
              Your Cart
            </h1>

            <p>
              Review your food
              before checkout.
            </p>
          </div>

          {cart.length > 0 && (
            <button
              className="text-danger-btn"
              onClick={() =>
                setCart([])
              }
            >
              Clear Cart
            </button>
          )}

        </div>

        {cart.length === 0 ? (

          <div className="empty-state">

            <ShoppingCart size={48} />

            <h3>
              Your cart is empty
            </h3>

            <p>
              Add some delicious
              food to continue.
            </p>

            <button
              className="primary-btn"
              onClick={() =>
                setPage("menu")
              }
            >
              Browse Menu
            </button>

          </div>

        ) : (

          <div className="cart-layout">

            <div className="cart-items">

              {cart.map((item) => (

                <div
                  className="cart-item"
                  key={item.id}
                >

                  <div className="cart-item-image">
                    {getFoodEmoji(item)}
                  </div>

                  <div className="cart-item-info">

                    <h3>
                      {item.name}
                    </h3>

                    <p>
                      ₹
                      {Number(
                        item.price
                      ).toFixed(2)}{" "}
                      each
                    </p>

                  </div>

                  <div className="quantity-control">

                    <button
                      onClick={() =>
                        decreaseQuantity(
                          item.id
                        )
                      }
                    >
                      <Minus size={15} />
                    </button>

                    <strong>
                      {item.quantity}
                    </strong>

                    <button
                      onClick={() =>
                        increaseQuantity(
                          item.id
                        )
                      }
                    >
                      <Plus size={15} />
                    </button>

                  </div>

                  <div className="cart-item-total">
                    ₹
                    {(
                      Number(
                        item.price
                      ) *
                      Number(
                        item.quantity
                      )
                    ).toFixed(2)}
                  </div>

                  <button
                    className="remove-btn"
                    onClick={() =>
                      removeFromCart(
                        item.id
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>

                </div>

              ))}

            </div>

            <div className="checkout-card">

              <h2>
                Checkout
              </h2>

              <div className="order-mode-selector">

                <button
                  className={`mode-btn ${
                    orderMode === "live"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    changeOrderMode(
                      "live"
                    )
                  }
                >
                  <Zap size={15} />
                  Live Order
                </button>

                <button
                  className={`mode-btn ${
                    orderMode ===
                    "preorder"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    changeOrderMode(
                      "preorder"
                    )
                  }
                >
                  <CalendarClock
                    size={15}
                  />
                  Preorder
                </button>

              </div>

              {orderMode === "preorder" && (
                <div className="slot-section">

                  <h3>
                  Today's Pickup Slot
                </h3>

                {slotsLoading ? (

                  <div className="small-loading">
                    Loading slots...
                  </div>

                ) : availableSlots.length ===
                  0 ? (

                  <div className="slot-empty">
                    No pickup slots are
                    currently available.
                  </div>

                ) : (

                  <div className="slot-grid">

                    {availableSlots.map(
                      (slot) => {

                        const selected =
                          Number(
                            selectedSlot
                          ) ===
                          Number(
                            slot.id
                          );

                        return (
                          <button
                            key={slot.id}
                            className={`slot-btn ${
                              selected
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              setSelectedSlot(
                                slot.id
                              )
                            }
                          >
                            <span>
                              {formatSlotTime(
                                slot
                              )}
                            </span>

                            <small>
                              {
                                slot.remaining
                              }{" "}
                              spots
                            </small>
                          </button>
                        );
                      }
                    )}

                  </div>

                )}

                </div>
              )}

              <div className="checkout-summary">

                <div className="checkout-summary-row">

                  <span>
                    Items
                  </span>

                  <strong>
                    {cart.reduce(
                      (sum, item) =>
                        sum +
                        Number(
                          item.quantity
                        ),
                      0
                    )}
                  </strong>

                </div>

                <div className="checkout-total">

                  <span>
                    Total
                  </span>

                  <strong>
                    ₹{total.toFixed(2)}
                  </strong>

                </div>

              </div>

              <button
                className="checkout-btn"
                onClick={placeOrder}
                disabled={
                  paymentLoading ||
                  cart.length === 0 ||
                  (
                    orderMode === "preorder" &&
                    !selectedSlot
                  )
                }
              >
                {paymentLoading
                  ? "Opening Payment..."
                  : "Pay & Place Order"}

                {!paymentLoading && (
                  <ChevronRight
                    size={18}
                  />
                )}
              </button>

            </div>

          </div>

        )}

      </main>
    );
  };

  // =========================================================
  // ORDERS PAGE
  // =========================================================

  const OrdersPage = () => {

    const orders =
      studentOrders.length > 0
        ? studentOrders
        : currentOrder
        ? [currentOrder]
        : [];

    if (orders.length === 0) {
      return (
        <main className="page-container">

          <div className="page-header">
            <div>
              <h1>Your Orders</h1>

              <p>
                Today's canteen orders.
              </p>
            </div>
          </div>

          <div className="empty-state">

            <ClipboardList
              size={48}
            />

            <h3>
              No orders yet
            </h3>

            <p>
              Your placed orders
              will appear here.
            </p>

            <button
              className="primary-btn"
              onClick={() =>
                setPage("menu")
              }
            >
              Order Food
            </button>

          </div>

        </main>
      );
    }

    const getSlotText = (order) => {

      if (!order?.slot_id) {
        return "Live Order";
      }

      const slot =
        slots.find(
          (item) =>
            Number(item.id) ===
            Number(order.slot_id)
        );

      return (
        slot?.slot_time ||
        (
          order.start_time &&
          order.end_time
            ? `${order.start_time} - ${order.end_time}`
            : "Today's pickup slot"
        )
      );
    };

    return (
      <main className="page-container">

        <div className="page-header">

          <div>
            <h1>
              Today's Orders
            </h1>

            <p>
              {orders.length} order
              {orders.length !== 1
                ? "s"
                : ""}{" "}
              placed today.
            </p>
          </div>

        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >

          {orders.map((order) => {

            const status =
              order?.status ||
              "PLACED";

            return (
              <div
                className="order-tracking-card"
                key={order.id}
              >

                <div
                  className={`order-status ${
                    status === "COMPLETED"
                      ? "completed"
                      : "placed"
                  }`}
                >

                  <div className="status-icon">

                    {status ===
                    "COMPLETED" ? (
                      <CheckCircle2
                        size={27}
                      />
                    ) : (
                      <Clock
                        size={27}
                      />
                    )}

                  </div>

                  <div className="order-main-status">

                    <h2>
                      {status ===
                      "COMPLETED"
                        ? "Order Completed"
                        : "Order Placed"}
                    </h2>

                    <p>
                      {status ===
                      "COMPLETED"
                        ? "Your food has been collected successfully."
                        : "Your payment is confirmed. Please collect your food."}
                    </p>

                  </div>

                </div>

                <div className="order-details-grid">

                  <div className="order-detail-box">
                    <span>
                      Order ID
                    </span>

                    <strong>
                      #{order.id}
                    </strong>
                  </div>

                  <div className="order-detail-box">
                    <span>
                      Order Type
                    </span>

                    <strong>
                      {getOrderModeLabel(
                        order.order_mode
                      )}
                    </strong>
                  </div>

                  <div className="order-detail-box">
                    <span>
                      Pickup
                    </span>

                    <strong>
                      {getSlotText(order)}
                    </strong>
                  </div>

                  <div className="order-detail-box">
                    <span>
                      Payment
                    </span>

                    <strong>
                      {order.payment_status}
                    </strong>
                  </div>

                  <div className="order-detail-box">
                    <span>
                      Total
                    </span>

                    <strong>
                      ₹
                      {Number(
                        order.total_amount ||
                          0
                      ).toFixed(2)}
                    </strong>
                  </div>

                </div>

                <div
                  style={{
                    marginTop: "20px",
                  }}
                >

                  <h3>
                    Ordered Items
                  </h3>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      marginTop: "10px",
                    }}
                  >

                    {(order.items || []).map(
                      (item, index) => (

                        <div
                          key={
                            item.menu_item_id ||
                            index
                          }
                          style={{
                            display: "flex",
                            justifyContent:
                              "space-between",
                            padding:
                              "10px 12px",
                            borderRadius:
                              "8px",
                            background:
                              "#f8fafc",
                          }}
                        >

                          <span>
                            {item.name}
                          </span>

                          <strong>
                            ×{" "}
                            {item.quantity}
                          </strong>

                        </div>

                      )
                    )}

                  </div>

                </div>

                {order.pickup_token && (

                    <div
                      className="pickup-token-card"
                      style={{
                        marginTop:
                          "20px",
                      }}
                    >

                      <span>
                        Pickup QR
                      </span>

                      <strong className="pickup-order-heading">
                        Order #{order.id}
                      </strong>

                      <p className="pickup-order-meta">
                        {getOrderModeLabel(order.order_mode)}
                        {order.slot_id
                          ? ` · ${getSlotText(order)}`
                          : ""}
                      </p>

                      <div className="pickup-qr-frame">
                        <QRCodeCanvas
                          value={buildPickupQrValue(order)}
                          size={320}
                          level="M"
                          includeMargin
                          bgColor="#ffffff"
                          fgColor="#000000"
                          marginSize={4}
                        />
                      </div>

                      <strong className="pickup-token-value">
                        Pickup Token: {order.pickup_token}
                      </strong>

                      <p>
                        {status === "COMPLETED"
                          ? "This order has already been picked up."
                          : "Show this QR code at the canteen counter to collect your order."}
                      </p>

                    </div>

                  )}

              </div>
            );
          })}

        </div>

      </main>
    );
  };

  // =========================================================
  // ADMIN DASHBOARD
  // =========================================================

  const AdminDashboard = () => {

    // =======================================================
    // ADD FOOD STATE
    // =======================================================

    const [
      showAddFoodForm,
      setShowAddFoodForm,
    ] = useState(false);

    const [newFood, setNewFood] =
      useState({
        name: "",
        description: "",
        price: "",
        category: "Breakfast",
        image_url: "",
        stock: 0,
        available: true,
      });

    const [addingFood, setAddingFood] =
      useState(false);

    // =======================================================
    // ADD FOOD
    // =======================================================

    const addFoodItem = async () => {
      try {
        if (!newFood.name.trim()) {
          alert(
            "Food name is required."
          );
          return;
        }

        if (
          !newFood.price ||
          Number(newFood.price) <= 0
        ) {
          alert(
            "Enter a valid price."
          );
          return;
        }

        if (
          !Number.isInteger(
            Number(newFood.stock)
          ) ||
          Number(newFood.stock) < 0
        ) {
          alert(
            "Stock must be a valid non-negative integer."
          );
          return;
        }

        setAddingFood(true);

        const token =
          localStorage.getItem(
            "token"
          );

        const response =
          await axios.post(
            `${API_URL}/api/menu`,
            {
              name:
                newFood.name.trim(),

              description:
                newFood.description.trim(),

              price:
                Number(newFood.price),

              category:
                newFood.category,

              image_url:
                newFood.image_url.trim(),

              stock:
                Number(newFood.stock),

              available:
                newFood.available,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          );

        if (response.data?.item) {
          setMenuItems(
            (previous) => [
              ...previous,
              response.data.item,
            ]
          );
        } else {
          await fetchMenu();
        }

        setNewFood({
          name: "",
          description: "",
          price: "",
          category: "Breakfast",
          image_url: "",
          stock: 0,
          available: true,
        });

        setShowAddFoodForm(false);

        alert(
          "Food item added successfully!"
        );

      } catch (error) {
        console.error(
          "Add food error:",
          error
        );

        alert(
          error.response?.data
            ?.message ||
            "Failed to add food item."
        );
      } finally {
        setAddingFood(false);
      }
    };

    // =======================================================
    // ORDERS
    // =======================================================

    const pendingOrders =
      adminOrders
        .filter(
          (order) =>
            order.status ===
              "PLACED" &&
            order.payment_status ===
              "PAID"
        )
        .sort((a, b) =>
          String(
            a.start_time || ""
          ).localeCompare(
            String(
              b.start_time || ""
            )
          )
        );

    const completedOrders =
      adminOrders.filter(
        (order) =>
          order.status ===
          "COMPLETED"
      );

    // =======================================================
    // RETURN
    // =======================================================

    return (
      <main className="page-container">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="page-header">

          <div>
            <h1>
              Admin Dashboard
            </h1>

            <p>
              Manage today's canteen
              operations.
            </p>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              className="admin-action-btn"
              onClick={() => {
                setAnalyticsOpen((previous) => !previous);
              }}
            >
              <BarChart3 size={15} />
              Monthly Analytics
            </button>

            <button
              className="admin-action-btn"
              onClick={async () => {
                await fetchAdminOrders();
                await fetchMenu();
                await fetchSlots();
                if (analyticsOpen) {
                  await fetchMonthlyAnalytics();
                }
              }}
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>

        </div>

        {/* =================================================
            STATS
        ================================================= */}

        <div className="admin-stats">

          <div className="admin-stat-card">

            <div className="admin-stat-icon">
              <ClipboardList
                size={22}
              />
            </div>

            <div>
              <span>
                Today's Orders
              </span>

              <strong>
                {adminOrders.length}
              </strong>
            </div>

          </div>

          <div className="admin-stat-card">

            <div className="admin-stat-icon">
              <Clock size={22} />
            </div>

            <div>
              <span>
                Pending Pickup
              </span>

              <strong>
                {pendingOrders.length}
              </strong>
            </div>

          </div>

          <div className="admin-stat-card">

            <div className="admin-stat-icon">
              <CheckCircle2
                size={22}
              />
            </div>

            <div>
              <span>
                Completed
              </span>

              <strong>
                {completedOrders.length}
              </strong>
            </div>

          </div>

          <div className="admin-stat-card">

            <div className="admin-stat-icon">
              <Utensils size={22} />
            </div>

            <div>
              <span>
                Menu Items
              </span>

              <strong>
                {menuItems.length}
              </strong>
            </div>

          </div>

        </div>

        {analyticsOpen && (
          <section className="admin-section">
            <div className="admin-section-header">
              <div>
                <h2>Monthly Analytics</h2>
                <p>Revenue, items sold and order trends for the selected month.</p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "18px" }}>
              <select
                value={analyticsMonth}
                onChange={(e) => setAnalyticsMonth(Number(e.target.value))}
                className="form-control"
              >
                {[1,2,3,4,5,6,7,8,9,10,11,12].map((month) => (
                  <option key={month} value={month}>
                    {getMonthName(month)}
                  </option>
                ))}
              </select>

              <select
                value={analyticsYear}
                onChange={(e) => setAnalyticsYear(Number(e.target.value))}
                className="form-control"
              >
                {[2024, 2025, 2026, 2027].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <button className="admin-action-btn" onClick={fetchMonthlyAnalytics} disabled={analyticsLoading}>
                {analyticsLoading ? "Loading..." : "Apply"}
              </button>
            </div>

            {analyticsLoading ? (
              <div className="admin-empty-state">Loading analytics...</div>
            ) : monthlyAnalytics ? (
              <>
                <div className="admin-stats">
                  <div className="admin-stat-card">
                    <div className="admin-stat-icon"><ClipboardList size={22} /></div>
                    <div>
                      <span>Total Revenue</span>
                      <strong>{formatCurrency(monthlyAnalytics.summary.totalRevenue)}</strong>
                    </div>
                  </div>

                  <div className="admin-stat-card">
                    <div className="admin-stat-icon"><Clock size={22} /></div>
                    <div>
                      <span>Total Paid Orders</span>
                      <strong>{monthlyAnalytics.summary.totalPaidOrders}</strong>
                    </div>
                  </div>

                  <div className="admin-stat-card">
                    <div className="admin-stat-icon"><CheckCircle2 size={22} /></div>
                    <div>
                      <span>Total Completed</span>
                      <strong>{monthlyAnalytics.summary.totalCompletedOrders}</strong>
                    </div>
                  </div>

                  <div className="admin-stat-card">
                    <div className="admin-stat-icon"><Utensils size={22} /></div>
                    <div>
                      <span>Items Sold</span>
                      <strong>{monthlyAnalytics.summary.totalItemsSold}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "18px", marginTop: "18px" }}>
                  <div className="admin-order-card">
                    <h3>Live vs Preorder</h3>
                    <div className="summary-row"><span>Live Orders</span><strong>{monthlyAnalytics.summary.liveOrders}</strong></div>
                    <div className="summary-row"><span>Live Revenue</span><strong>{formatCurrency(monthlyAnalytics.summary.liveRevenue)}</strong></div>
                    <div className="summary-row"><span>Preorders</span><strong>{monthlyAnalytics.summary.preorderOrders}</strong></div>
                    <div className="summary-row"><span>Preorder Revenue</span><strong>{formatCurrency(monthlyAnalytics.summary.preorderRevenue)}</strong></div>
                  </div>

                  <div className="admin-order-card">
                    <h3>Summary</h3>
                    <div className="summary-row"><span>Average Order Value</span><strong>{formatCurrency(monthlyAnalytics.summary.averageOrderValue)}</strong></div>
                    <div className="summary-row"><span>Completed Orders</span><strong>{monthlyAnalytics.summary.totalCompletedOrders}</strong></div>
                    <div className="summary-row"><span>Month</span><strong>{getMonthName(monthlyAnalytics.month)} {monthlyAnalytics.year}</strong></div>
                  </div>
                </div>

                <div className="admin-order-card" style={{ marginTop: "18px" }}>
                  <h3>Daily Revenue Breakdown</h3>
                  <div style={{ maxHeight: "240px", overflowY: "auto" }}>
                    {monthlyAnalytics.dailyBreakdown.map((day) => (
                      <div key={day.date} className="summary-row">
                        <span>{new Date(`${day.date}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                        <strong>{day.orders} | {formatCurrency(day.revenue)}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-order-card" style={{ marginTop: "18px" }}>
                  <h3>Monthly Revenue Chart</h3>
                  {monthlyAnalytics.dailyBreakdown.length > 0 ? (
                    (() => {
                      const maxRevenue = Math.max(
                        ...monthlyAnalytics.dailyBreakdown.map(
                          (entry) => Number(entry.revenue || 0)
                        ),
                        1
                      );

                      return (
                        <div className="revenue-chart" aria-label="Monthly revenue chart">
                          {monthlyAnalytics.dailyBreakdown.map((entry) => {
                            const height =
                              (Number(entry.revenue || 0) / maxRevenue) * 100;

                            return (
                              <div
                                className="revenue-chart-bar-wrap"
                                key={entry.date}
                                title={`${entry.date}: ${formatCurrency(entry.revenue)}`}
                              >
                                <div
                                  className="revenue-chart-bar"
                                  style={{ height: `${Math.max(height, 2)}%` }}
                                />
                                <span>{entry.day}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()
                  ) : (
                    <p>No revenue data available for this month.</p>
                  )}
                </div>

                <div className="admin-order-card" style={{ marginTop: "18px" }}>
                  <h3>Top Selling Food</h3>
                  {(monthlyAnalytics.topItems || []).length > 0 ? (
                    monthlyAnalytics.topItems.map((item) => (
                      <div key={item.name} className="summary-row">
                        <span>{item.name}</span>
                        <strong>{item.quantitySold} sold | {formatCurrency(item.revenue)}</strong>
                      </div>
                    ))
                  ) : (
                    <p>No paid orders yet for this month.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="admin-empty-state">No analytics available for this month.</div>
            )}
          </section>
        )}

        {/* =================================================
            PREPARATION QUEUE
        ================================================= */}

        <section className="admin-section">

          <div className="admin-section-header">

            <div>
              <h2>
                Preparation Queue
              </h2>

              <p>
                Paid orders arranged
                by pickup time.
              </p>
            </div>

            <span className="admin-count-badge">
              {pendingOrders.length}
            </span>

          </div>

          {adminOrdersLoading ? (

            <div className="admin-empty-state">
              Loading orders...
            </div>

          ) : pendingOrders.length ===
            0 ? (

            <div className="admin-empty-state">

              <CheckCircle2
                size={42}
              />

              <h3>
                No pending orders
              </h3>

              <p>
                New paid orders will
                appear here automatically.
              </p>

            </div>

          ) : (

            <div className="admin-orders-list">

              {pendingOrders.map(
                (order) => (

                  <div
                    className="admin-order-card"
                    key={order.id}
                  >

                    <div className="admin-order-header">

                      <div>

                        <span className="admin-order-id">
                          Order #{order.id}
                        </span>

                        <h3>
                          {order.student_name ||
                            order.user_name ||
                            "Student"}
                        </h3>

                        <small>
                          {order.student_email ||
                            order.user_email ||
                            ""}
                        </small>

                      </div>

                      <div className="admin-order-slot">

                        <Clock size={18} />

                        <strong>
                          {order.slot_time ||
                            `${order.start_time || ""} - ${order.end_time || ""}`}
                        </strong>

                        <small>
                          {order.order_mode ===
                          "preorder"
                            ? "PREORDER"
                            : "LIVE ORDER"}
                        </small>

                      </div>

                    </div>

                    <div className="admin-order-items">

                      {(order.items ||
                        []).map(
                        (
                          item,
                          index
                        ) => (

                          <div
                            className="admin-order-item"
                            key={
                              item.menu_item_id ||
                              item.id ||
                              index
                            }
                          >

                            <span>
                              {item.name ||
                                item.item_name ||
                                "Food Item"}
                            </span>

                            <strong>
                              ×{" "}
                              {
                                item.quantity
                              }
                            </strong>

                          </div>

                        )
                      )}

                    </div>

                    <div className="admin-order-footer">

                      <div>

                        <span>
                          Total
                        </span>

                        <strong>
                          ₹
                          {Number(
                            order.total_amount ||
                              0
                          ).toFixed(2)}
                        </strong>

                      </div>

                      <div>

                        <span>
                          Payment
                        </span>

                        <strong className="paid-text">
                          PAID
                        </strong>

                      </div>

                      <div>

                        <span>
                          Token
                        </span>

                        <strong className="token-mini">
                          {order.pickup_token ||
                            "—"}
                        </strong>

                      </div>

                    </div>

                  </div>

                )
              )}

            </div>

          )}

        </section>

        {/* =================================================
            PICKUP VERIFICATION
        ================================================= */}

        <section className="admin-section">

          <div className="admin-section-header">

            <div>

              <h2>
                Pickup Verification
              </h2>

              <p>
                Scan the student pickup QR to verify and complete the order.
              </p>

            </div>

          </div>

          <div className="pickup-verification-card">

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <button
                type="button"
                className="verify-pickup-btn"
                onClick={
                  qrScannerOpen
                    ? stopQrScanner
                    : startQrScanner
                }
                disabled={pickupLoading || qrScannerLoading}
              >
                {qrScannerLoading
                  ? "Starting Camera..."
                  : qrScannerOpen
                  ? "Stop QR Scanner"
                  : "Scan Pickup QR"}
              </button>

              <div
                className={
                  qrScannerOpen
                    ? "qr-scanner-frame"
                    : "qr-reader-idle"
                }
              >
                <div id="pickup-qr-reader" />
              </div>

              {scannerError && (
                <div className="error-banner">
                  {scannerError}
                </div>
              )}

              <form
                className="pickup-token-fallback"
                onSubmit={verifyPickupToken}
              >
                <div>
                  <h3>Camera not working?</h3>
                  <p>
                    Enter the student's pickup token to verify the order
                    instead.
                  </p>
                </div>
                <label htmlFor="pickup-token-input">
                  Pickup token
                </label>
                <div className="pickup-token-controls">
                  <input
                    id="pickup-token-input"
                    type="text"
                    value={pickupTokenInput}
                    onChange={(event) => {
                      // Allow continuous typing; sanitize later on composition end or paste
                      const v = event.target.value;
                      setPickupTokenInput(v.slice(0, 6));
                    }}
                    onCompositionStart={() => (compositionRef.current = true)}
                    onCompositionEnd={(event) => {
                      compositionRef.current = false;
                      const sanitized = event.target.value
                        .replace(/[^a-z0-9]/gi, "")
                        .toUpperCase()
                        .slice(0, 6);
                      setPickupTokenInput(sanitized);
                    }}
                    onPaste={(event) => {
                      event.preventDefault();
                      const text = (event.clipboardData || window.clipboardData)
                        .getData("text")
                        .replace(/[^a-z0-9]/gi, "")
                        .toUpperCase()
                        .slice(0, 6);
                      setPickupTokenInput(text);
                    }}
                    autoComplete="off"
                    maxLength={6}
                    placeholder="e.g. MF9X3N"
                    aria-label="Student pickup token"
                    disabled={pickupLoading || qrScannerOpen}
                  />
                  <button
                    type="submit"
                    className="verify-pickup-btn"
                    disabled={
                      pickupLoading ||
                      qrScannerLoading ||
                      qrScannerOpen ||
                      pickupTokenInput.length !== 6
                    }
                  >
                    {pickupLoading
                      ? "Verifying..."
                      : "Verify Token & Complete Order"}
                  </button>
                </div>
                {qrScannerOpen && (
                  <p className="pickup-token-note">
                    Stop the camera scanner before using token verification.
                  </p>
                )}
              </form>
            </div>

            {pickupScanResult?.ok && (
              <div className="scan-result-card">
                <h3>Pickup Verified ✓</h3>

                <div className="order-details-grid">
                  <div className="order-detail-box">
                    <span>Order</span>
                    <strong>
                      #{pickupScanResult.id}
                    </strong>
                  </div>

                  <div className="order-detail-box">
                    <span>Student</span>
                    <strong>
                      {pickupScanResult.student_name || "Student"}
                    </strong>
                  </div>

                  <div className="order-detail-box">
                    <span>Order Type</span>
                    <strong>
                      {getOrderModeLabel(
                        pickupScanResult.order_mode
                      )}
                    </strong>
                  </div>

                  <div className="order-detail-box">
                    <span>Pickup Slot</span>
                    <strong>
                      {pickupScanResult.slot_id
                        ? formatTimeLabel(
                            pickupScanResult.start_time ||
                              pickupScanResult.slot_time
                          ) || "Today's slot"
                        : "Live Order"}
                    </strong>
                  </div>
                </div>

                <div style={{ marginTop: "16px" }}>
                  <h4>Items</h4>
                  {(pickupScanResult.items || []).map(
                    (item, index) => (
                      <div
                        key={item.menu_item_id || index}
                        className="admin-order-item"
                      >
                        <span>{item.name}</span>
                        <strong>× {item.quantity}</strong>
                      </div>
                    )
                  )}
                </div>

                <div className="summary-row">
                  <span>Total</span>
                  <strong>
                    {formatCurrency(
                      pickupScanResult.total_amount || 0
                    )}
                  </strong>
                </div>

                <div className="summary-row">
                  <span>Status</span>
                  <strong>COMPLETED</strong>
                </div>
              </div>
            )}

            {pickupScanResult && pickupScanResult.ok === false && (
              <div className="scan-result-card scan-result-error">
                <h3>{pickupScanResult.title}</h3>
                <p>{pickupScanResult.message}</p>
                <button
                  type="button"
                  className="verify-pickup-btn"
                  onClick={startQrScanner}
                  disabled={qrScannerLoading || qrScannerOpen}
                >
                  Retry Scanner
                </button>
              </div>
            )}
          </div>

        </section>

        {/* =================================================
            MENU & STOCK
        ================================================= */}

        <section className="admin-section">

          {/* ===============================================
              MENU HEADER + ADD BUTTON
          =============================================== */}

          <div className="admin-section-header">

            <div>
              <h2>
                Menu & Stock
              </h2>

              <p>
                Manage food quantity
                and availability.
              </p>
            </div>

            {/* THIS IS THE ADD MENU BUTTON */}

            <button
              className="admin-action-btn"
              onClick={() =>
                setShowAddFoodForm(
                  true
                )
              }
            >
              <Plus size={16} />
              Add Menu Item
            </button>

          </div>

          {/* =================================================
              ADD FOOD FORM
              HIDDEN UNTIL BUTTON IS CLICKED
          ================================================= */}

          {showAddFoodForm && (

            <div className="add-food-form">

              <div className="admin-section-header">

                <div>
                  <h3>
                    Add New Food Item
                  </h3>

                  <p>
                    Enter the details
                    of the new menu
                    item.
                  </p>
                </div>

                <button
                  className="nav-btn"
                  onClick={() =>
                    setShowAddFoodForm(
                      false
                    )
                  }
                >
                  <X size={17} />
                  Cancel
                </button>

              </div>

              <div className="form-group">

                <label>
                  Food Name
                </label>

                <input
                  type="text"
                  value={newFood.name}
                  onChange={(e) =>
                    setNewFood({
                      ...newFood,
                      name:
                        e.target.value,
                    })
                  }
                  placeholder="e.g. Masala Dosa"
                />

              </div>

              <div className="form-group">

                <label>
                  Description
                </label>

                <textarea
                  value={
                    newFood.description
                  }
                  onChange={(e) =>
                    setNewFood({
                      ...newFood,
                      description:
                        e.target.value,
                    })
                  }
                  placeholder="Food description"
                  rows={3}
                />

              </div>

              <div className="form-row">

                <div className="form-group">

                  <label>
                    Price (₹)
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={
                      newFood.price
                    }
                    onChange={(e) =>
                      setNewFood({
                        ...newFood,
                        price:
                          e.target.value,
                      })
                    }
                    placeholder="50"
                  />

                </div>

                <div className="form-group">

                  <label>
                    Initial Stock
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={
                      newFood.stock
                    }
                    onChange={(e) =>
                      setNewFood({
                        ...newFood,
                        stock:
                          e.target.value,
                      })
                    }
                    placeholder="20"
                  />

                </div>

              </div>

              <div className="form-group">

                <label>
                  Category
                </label>

                <select
                  value={
                    newFood.category
                  }
                  onChange={(e) =>
                    setNewFood({
                      ...newFood,
                      category:
                        e.target.value,
                    })
                  }
                >
                  <option value="Breakfast">
                    Breakfast
                  </option>

                  <option value="Lunch">
                    Lunch
                  </option>

                  <option value="Snacks">
                    Snacks
                  </option>

                  <option value="Beverages">
                    Beverages
                  </option>

                  <option value="Desserts">
                    Desserts
                  </option>

                  <option value="Other">
                    Other
                  </option>
                </select>

              </div>

              <div className="form-group">

                <label>
                  Image URL
                </label>

                <input
                  type="text"
                  value={
                    newFood.image_url
                  }
                  onChange={(e) =>
                    setNewFood({
                      ...newFood,
                      image_url:
                        e.target.value,
                    })
                  }
                  placeholder="https://..."
                />

              </div>

              <div className="form-group checkbox-group">

                <label>

                  <input
                    type="checkbox"
                    checked={
                      newFood.available
                    }
                    onChange={(e) =>
                      setNewFood({
                        ...newFood,
                        available:
                          e.target.checked,
                      })
                    }
                  />

                  Available for
                  students

                </label>

              </div>

              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  marginTop: "10px",
                }}
              >

                <button
                  className="admin-action-btn"
                  onClick={
                    addFoodItem
                  }
                  disabled={
                    addingFood
                  }
                >
                  <Plus size={16} />

                  {addingFood
                    ? "Adding..."
                    : "Add Food Item"}
                </button>

                <button
                  className="nav-btn"
                  onClick={() =>
                    setShowAddFoodForm(
                      false
                    )
                  }
                  disabled={
                    addingFood
                  }
                >
                  Cancel
                </button>

              </div>

            </div>

          )}

          {/* =================================================
              EXISTING MENU LIST
          ================================================= */}

          <div className="admin-menu-list">

            {menuItems.map((item) => {

              const stock = Number(
                item.stock || 0
              );

              const updating =
                Boolean(
                  stockUpdating[
                    item.id
                  ]
                );

              return (
                <div
                  className="admin-menu-card"
                  key={item.id}
                >

                  <div className="admin-menu-info">

                    <div className="admin-menu-icon">
                      {getFoodEmoji(item)}
                    </div>

                    <div>

                      <h3>
                        {item.name}
                      </h3>

                      <p>
                        ₹
                        {Number(
                          item.price || 0
                        ).toFixed(2)}
                      </p>

                    </div>

                  </div>

                  <div className="admin-stock-control">

                    <span>
                      Stock
                    </span>

                    <div className="stock-buttons">

                      <button
                        disabled={
                          updating ||
                          stock <= 0
                        }
                        onClick={() =>
                          updateStock(
                            item.id,
                            stock - 1
                          )
                        }
                      >
                        <Minus size={16} />
                      </button>

                      <strong>
                        {stock}
                      </strong>

                      <button
                        disabled={
                          updating
                        }
                        onClick={() =>
                          updateStock(
                            item.id,
                            stock + 1
                          )
                        }
                      >
                        <Plus size={16} />
                      </button>

                    </div>

                    <button
                      className="set-stock-btn"
                      disabled={
                        updating
                      }
                      onClick={() => {

                        const value =
                          window.prompt(
                            `Set stock for ${item.name}:`,
                            String(
                              stock
                            )
                          );

                        if (
                          value ===
                          null
                        ) {
                          return;
                        }

                        updateStock(
                          item.id,
                          Number(value)
                        );

                      }}
                    >
                      Set Stock
                    </button>

                  </div>

                  <div className="admin-availability">

                    <span
                      className={
                        stock > 0 &&
                        item.available
                          ? "stock-status available"
                          : "stock-status unavailable"
                      }
                    >
                      {stock > 0 &&
                      item.available
                        ? "Available"
                        : "Unavailable"}
                    </span>

                    <button
                      className={
                        item.available &&
                        stock > 0
                          ? "availability-btn active"
                          : "availability-btn"
                      }
                      disabled={
                        updating ||
                        stock <= 0
                      }
                      onClick={() =>
                        updateAvailability(
                          item.id,
                          !item.available
                        )
                      }
                    >
                      {item.available &&
                      stock > 0
                        ? "Disable"
                        : "Enable"}
                    </button>

                  </div>

                </div>
              );
            })}

          </div>

        </section>

      </main>
    );
  };

  // =========================================================
  // FINAL ROUTING
  // =========================================================

  if (user.role === "admin") {
    return (
      <div className="app">

        <AdminNavbar />

        <AdminDashboard />

      </div>
    );
  }

  return (
    <div className="app">

      <StudentNavbar />

      {page === "home" && (
        <HomePage />
      )}

      {page === "menu" && (
        <MenuPage />
      )}

      {page === "cart" && (
        <CartPage />
      )}

      {page === "orders" && (
        <OrdersPage />
      )}

      {![
        "home",
        "menu",
        "cart",
        "orders",
      ].includes(page) && (
        <HomePage />
      )}

    </div>
  );
}

export default App;