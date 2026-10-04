import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeSVG } from "qrcode.react";

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
} from "lucide-react";

import Login from "./LoginTemp.jsx";
import Register from "./RegisterTemp.jsx";
import "./App.css";

const API_URL = "http://localhost:5000";

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

  const [pickupToken, setPickupToken] =
    useState("");

  const [pickupLoading, setPickupLoading] =
    useState(false);

  const [qrScannerOpen, setQrScannerOpen] =
    useState(false);

  const [qrScannerLoading, setQrScannerLoading] =
    useState(false);

  const qrScannerRef = useRef(null);

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
            } catch (error) {}
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
    }
  }, [user]);

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
  // VERIFY PICKUP
  // =========================================================

  const verifyPickup = async (
    orderId,
    tokenValue
  ) => {
    if (!orderId) {
      alert(
        "Order ID is required."
      );
      return false;
    }

    const token = String(
      tokenValue || ""
    )
      .trim()
      .toUpperCase();

    if (!token) {
      alert(
        "Pickup token is required."
      );
      return false;
    }

    try {
      setPickupLoading(true);

      const authToken =
        localStorage.getItem(
          "token"
        );

      const response =
        await axios.post(
          `${API_URL}/api/orders/${orderId}/pickup`,
          {
            pickup_token: token,
          },
          {
            headers: {
              Authorization:
                `Bearer ${authToken}`,
            },
          }
        );

      const completedOrder =
        response.data?.order ||
        response.data;

      setCurrentOrder(
        (previous) => ({
          ...previous,
          ...completedOrder,
        })
      );

      await fetchAdminOrders();

      return true;
    } catch (error) {
      console.error(
        "Pickup verification error:",
        error
      );

      alert(
        error.response?.data
          ?.message ||
          "Pickup verification failed."
      );

      return false;
    } finally {
      setPickupLoading(false);
    }
  };

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
    } catch (error) {}

    qrScannerRef.current = null;
    setQrScannerOpen(false);
    setQrScannerLoading(false);
  };

  const startQrScanner = async () => {
    if (qrScannerRef.current) return;

    setQrScannerOpen(true);
    setQrScannerLoading(true);

    try {
      const scanner = new Html5Qrcode(
        "pickup-qr-reader"
      );

      qrScannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          try {
            const data = JSON.parse(decodedText);

            if (
              data?.type !==
                "PICT_CANTEEN_PICKUP" ||
              !data?.order_id ||
              !data?.pickup_token
            ) {
              alert("Invalid PICT Canteen pickup QR.");
              return;
            }

            await stopQrScanner();

            const success = await verifyPickup(
              Number(data.order_id),
              data.pickup_token
            );

            if (success) {
              alert("Pickup verified successfully.");
            }
          } catch (error) {
            console.error("QR scan parse error:", error);
            alert("Invalid QR code. Please scan the student's pickup QR.");
          }
        },
        () => {}
      );

      setQrScannerLoading(false);
    } catch (error) {
      console.error("QR scanner start error:", error);
      qrScannerRef.current = null;
      setQrScannerOpen(false);
      setQrScannerLoading(false);

      alert(
        "Unable to start camera. Please allow camera permission and try again."
      );
    }
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

                {status !==
                  "COMPLETED" &&
                  order.pickup_token && (

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

                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "center",
                          margin:
                            "18px 0",
                        }}
                      >

                        <QRCodeSVG
                          value={JSON.stringify(
                            {
                              type:
                                "PICT_CANTEEN_PICKUP",

                              order_id:
                                Number(
                                  order.id
                                ),

                              pickup_token:
                                order.pickup_token,
                            }
                          )}
                          size={220}
                          level="H"
                        />

                      </div>

                      <strong>
                        Order #{order.id}
                      </strong>

                      <p>
                        Show this QR code
                        at the canteen
                        counter to collect
                        your order.
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

          <button
            className="admin-action-btn"
            onClick={async () => {
              await fetchAdminOrders();
              await fetchMenu();
              await fetchSlots();
            }}
          >
            <RefreshCw size={15} />
            Refresh
          </button>

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
                Verify the student's
                pickup token.
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
                  : "Scan Student QR"}
              </button>

              {qrScannerOpen && (
                <div
                  style={{
                    width: "100%",
                    maxWidth: "420px",
                    margin: "0 auto",
                    overflow: "hidden",
                    borderRadius: "16px",
                    border: "1px solid #ddd",
                  }}
                >
                  <div id="pickup-qr-reader" />
                </div>
              )}
            </div>

            <div className="pickup-input-group">

              <label>
                Order ID
              </label>

              <input
                id="pickup-order-id"
                type="number"
                placeholder="Enter order ID"
              />

            </div>

            <div className="pickup-input-group">

              <label>
                Pickup Token
              </label>

              <input
                type="text"
                placeholder="Enter pickup token"
                value={pickupToken}
                onChange={(e) =>
                  setPickupToken(
                    e.target.value
                      .toUpperCase()
                  )
                }
                maxLength={20}
              />

            </div>

            <button
              className="verify-pickup-btn"
              disabled={
                pickupLoading
              }
              onClick={async () => {

                const input =
                  document.getElementById(
                    "pickup-order-id"
                  );

                const orderId =
                  Number(
                    input?.value
                  );

                if (
                  !Number.isInteger(
                    orderId
                  ) ||
                  orderId <= 0
                ) {
                  alert(
                    "Enter a valid order ID."
                  );
                  return;
                }

                const success =
                  await verifyPickup(
                    orderId,
                    pickupToken
                  );

                if (success) {

                  setPickupToken("");

                  if (input) {
                    input.value = "";
                  }

                  alert(
                    "Pickup verified successfully."
                  );
                }

              }}
            >
              {pickupLoading
                ? "Verifying..."
                : "Verify Pickup"}
            </button>

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