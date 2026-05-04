
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Role, User, Product, CartItem, Order, Customer, normalizeRole } from './types';
import { supabaseService } from './supabase';
import { APP_CONFIG } from './constants';
import PinLogin from './components/PinLogin';
import Catalog from './components/Catalog';
import Cart from './components/Cart';
import AdminDashboard from './components/AdminDashboard';
import History from './components/History';
import Receipt from './components/Receipt';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'catalog' | 'admin' | 'history'>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showReceipt, setShowReceipt] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [isDockVisible, setIsDockVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [prods, ords] = await Promise.all([
        supabaseService.getProducts(),
        supabaseService.getOrders()
      ]);
      setProducts(prods);
      setOrders(ords);
      setLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    if (user) {
      supabaseService.getCustomers(user).then(setCustomers);
    } else {
      setCustomers([]);
    }
  }, [user]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const currentScrollY = scrollContainerRef.current.scrollTop;
    const scrollDiff = currentScrollY - lastScrollY.current;
    if (currentScrollY < 10) setIsDockVisible(true);
    else if (scrollDiff > 10 && isDockVisible) setIsDockVisible(false);
    else if (scrollDiff < -10 && !isDockVisible) setIsDockVisible(true);
    lastScrollY.current = currentScrollY;
  };

  const handleLogin = (authenticatedUser: User) => {
    setUser(authenticatedUser);
    setView('catalog');
  };

  const handleLogout = () => {
    setUser(null);
    setView('catalog');
    setCart([]);
  };

  const addToCart = (product: Product) => {
    if (!user || normalizeRole(user.role) === Role.GUDANG) return;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  };

  const updateCartQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const setManualQuantity = (id: string, value: number) => {
    setCart(prev => prev.map(item => 
      item.id === id ? { ...item, quantity: value } : item
    ));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleCheckout = async (discount: number = 0, buyerName?: string, buyerPhone?: string, customerId?: string) => {
    if (!user || cart.length === 0) return;

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) - discount;
    const date = new Date();
    
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear().toString();
    const random = Math.floor(1000 + Math.random() * 9000);
    const receiptNum = `${d}${m}${y}${random}`;

    const newOrder: Order = {
      id: crypto.randomUUID(),
      receipt_number: receiptNum,
      user_id: user.id,
      user_name: user.name,
      total_amount: total,
      discount: discount,
      items: [...cart],
      created_at: new Date().toISOString(),
      buyer_name: buyerName || undefined,
      buyer_phone: buyerPhone || undefined,
      customer_id: customerId
    };

    await supabaseService.createOrder(newOrder);
    setOrders(prev => [newOrder, ...prev]);
    
    // Refresh products for stock
    setProducts(await supabaseService.getProducts());
    // Refresh customers for points
    setCustomers(await supabaseService.getCustomers(user));

    setShowReceipt(newOrder);
    setCart([]);
  };

  const handleSaveCustomer = async (customer: Customer) => {
    if (!user) return;
    await supabaseService.saveCustomer(customer);
    setCustomers(await supabaseService.getCustomers(user));
  };

  // Navigasi Logic untuk Sliding Indicator
  const dockTabs = useMemo(() => {
    if (!user) return [];
    const tabs = [
      { id: 'catalog', label: 'Katalog', icon: 'fa-th-large' },
      { id: 'history', label: 'Riwayat', icon: 'fa-history' },
      { id: 'admin', label: 'Admin', icon: 'fa-cog' }
    ];
    return tabs;
  }, [user]);

  const activeTabIndex = dockTabs.findIndex(t => t.id === view);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-600 border-opacity-20 border-t-blue-600 mb-4"></div>
        <p className="text-gray-400 font-bold text-sm tracking-widest uppercase animate-pulse">Memuat SmartPOS...</p>
      </div>
    );
  }

  const canUseCart = user && normalizeRole(user.role) !== Role.GUDANG;

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="bg-white border-b shrink-0 z-40 px-3 py-2.5 no-print">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-black text-blue-700 flex items-center gap-2 tracking-tight">
              <i className="fas fa-cash-register"></i> <span>SmartPOS</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {!user ? (
              <button 
                onClick={() => (document.getElementById('login-modal') as any).showModal()}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-full font-bold flex items-center gap-2 text-sm"
              >
                <i className="fas fa-lock text-xs"></i> Login
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-right flex flex-col items-end">
                  <p className="font-bold text-gray-800 text-xs leading-tight">{user.name.split(' ')[0]}</p>
                  <p className="text-[8px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">{user.role}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="text-red-600 bg-red-50 p-2 rounded-lg font-bold text-xs"
                  title="Logout"
                >
                  <i className="fas fa-sign-out-alt"></i>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-3 no-print scroll-smooth"
      >
        <div className="w-full">
          {view === 'catalog' && (
            <div className="flex flex-col gap-4 pb-24">
              {canUseCart && (
                <div className="order-1">
                  <Cart 
                    items={cart} 
                    onUpdateQuantity={updateCartQuantity} 
                    onSetQuantity={setManualQuantity}
                    onRemove={removeFromCart} 
                    onCheckout={handleCheckout}
                    onReset={() => setCart([])}
                    customers={customers}
                    onSaveCustomer={handleSaveCustomer}
                    currentUser={user!}
                  />
                </div>
              )}
              <div className="order-2">
                <Catalog products={products} onAddToCart={addToCart} user={user} />
              </div>
            </div>
          )}
          {view === 'admin' && user && (
            <div className="pb-24">
              <AdminDashboard 
                products={products} 
                onProductsChange={async () => setProducts(await supabaseService.getProducts())}
                orders={orders}
                customers={customers}
                currentUser={user}
                onCustomersChange={async () => setCustomers(await supabaseService.getCustomers(user))}
              />
            </div>
          )}
          {view === 'history' && user && (
            <div className="pb-24">
              <History orders={orders} user={user} onViewOrder={setShowReceipt} />
            </div>
          )}
        </div>
      </main>

      {user && (
        <div 
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 no-print px-4 w-full max-w-[360px] transition-all duration-500 ease-in-out ${
            isDockVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-24 opacity-0 scale-90'
          }`}
        >
          <div className="bg-white/80 backdrop-blur-2xl p-1.5 rounded-[2.5rem] flex items-center relative border border-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] h-16">
            
            {/* Improved Sliding Background Indicator Logic */}
            {dockTabs.length > 0 && (
              <div 
                className="absolute transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-0 flex items-center justify-center p-1"
                style={{ 
                  width: `${100 / dockTabs.length}%`,
                  height: '100%',
                  left: 0,
                  transform: `translateX(${activeTabIndex * 100}%)`
                }}
              >
                <div className="w-full h-full bg-blue-600 rounded-[2rem] shadow-lg shadow-blue-200"></div>
              </div>
            )}

            {dockTabs.map((tab) => (
              <button 
                key={tab.id}
                onClick={() => { setView(tab.id as any); scrollContainerRef.current?.scrollTo(0,0); }}
                className={`relative z-10 flex-1 flex flex-col items-center justify-center h-full transition-colors duration-500 ${
                  view === tab.id ? 'text-white' : 'text-gray-400'
                }`}
              >
                <i className={`fas ${tab.icon} text-base mb-0.5`}></i>
                <span className="text-[9px] font-black uppercase tracking-wider">
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <dialog id="login-modal" className="modal p-0 rounded-[2.5rem] backdrop:bg-black/70 no-print overflow-hidden">
        <div className="w-full max-w-[320px] landscape:max-w-[500px] h-auto overflow-y-auto max-h-[95vh]">
          <PinLogin onLogin={handleLogin} onCancel={() => (document.getElementById('login-modal') as any).close()} />
        </div>
      </dialog>

      {showReceipt && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 no-print">
          <div className="bg-white rounded-xl max-w-[340px] w-full p-5 animate-in zoom-in duration-200">
            <div className="max-h-[70vh] overflow-y-auto">
              <Receipt order={showReceipt} />
            </div>
            <div className="mt-6 flex gap-2">
              <button 
                onClick={() => window.print()}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold text-sm"
              >
                Cetak Nota
              </button>
              <button 
                onClick={() => setShowReceipt(null)}
                className="flex-1 border border-gray-300 py-3 rounded-lg font-bold text-gray-600 text-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      <div id="print-area" className="hidden">
        {showReceipt && <Receipt order={showReceipt} />}
      </div>
    </div>
  );
};

export default App;
