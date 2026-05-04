
import { createClient } from '@supabase/supabase-js';
import { Product, User, Order, Customer, Role, normalizeRole } from './types';
import { INITIAL_PRODUCTS, INITIAL_USERS } from './constants';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

const isSupabaseReady = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';
const supabase = isSupabaseReady ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const updateLocalCache = (key: string, data: any) => {
  localStorage.setItem(key, JSON.stringify(data));
};

const getLocalCache = (key: string) => {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : null;
};

const initStorage = () => {
  if (!localStorage.getItem('pos_products')) {
    updateLocalCache('pos_products', INITIAL_PRODUCTS);
  }
  if (!localStorage.getItem('pos_users')) {
    updateLocalCache('pos_users', INITIAL_USERS);
  }
  if (!localStorage.getItem('pos_orders')) {
    updateLocalCache('pos_orders', []);
  }
  if (!localStorage.getItem('pos_customers')) {
    updateLocalCache('pos_customers', []);
  }
};

initStorage();

export const supabaseService = {
  getProducts: async (): Promise<Product[]> => {
    if (!supabase) return getLocalCache('pos_products') || [];
    try {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (error) throw error;
      updateLocalCache('pos_products', data);
      return data as Product[];
    } catch (err) {
      return getLocalCache('pos_products') || [];
    }
  },
  
  saveProduct: async (product: Product): Promise<void> => {
    if (!supabase) {
      const prods = getLocalCache('pos_products') || [];
      const index = prods.findIndex((p: any) => p.id === product.id);
      if (index > -1) prods[index] = product;
      else prods.push(product);
      updateLocalCache('pos_products', prods);
      return;
    }
    const { error } = await supabase.from('products').upsert(product);
    if (error) throw error;
  },

  deleteProduct: async (id: string): Promise<void> => {
    if (!supabase) {
      const prods = (getLocalCache('pos_products') || []).filter((p: any) => p.id !== id);
      updateLocalCache('pos_products', prods);
      return;
    }
    await supabase.from('products').delete().eq('id', id);
  },

  getUsers: async (): Promise<User[]> => {
    if (!supabase) return getLocalCache('pos_users') || [];
    try {
      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;
      const normalizedData = (data || []).map((u: any) => ({
        ...u,
        role: normalizeRole(u.role)
      }));
      updateLocalCache('pos_users', normalizedData);
      return normalizedData as User[];
    } catch (err) {
      const cached = getLocalCache('pos_users') || [];
      return cached.map((u: any) => ({
        ...u,
        role: normalizeRole(u.role)
      })) as User[];
    }
  },

  saveUser: async (user: User): Promise<void> => {
    if (!supabase) {
      const users = getLocalCache('pos_users') || [];
      const index = users.findIndex((u: any) => u.id === user.id);
      if (index > -1) users[index] = user;
      else users.push(user);
      updateLocalCache('pos_users', users);
      return;
    }
    await supabase.from('users').upsert(user);
  },

  deleteUser: async (id: string): Promise<void> => {
    if (!supabase) {
      const users = (getLocalCache('pos_users') || []).filter((u: any) => u.id !== id);
      updateLocalCache('pos_users', users);
      return;
    }
    await supabase.from('users').delete().eq('id', id);
  },

  getCustomers: async (user: User): Promise<Customer[]> => {
    let allCustomers = getLocalCache('pos_customers') || [];
    
    // Normalize user role before check
    const userRole = normalizeRole(user.role);
    
    // RBAC Filter Logic
    let filtered: Customer[] = [];
    if (userRole === Role.ADMIN) {
      filtered = allCustomers;
    } else if (userRole === Role.SALES || userRole === Role.KASIR) {
      filtered = allCustomers.filter((c: Customer) => c.created_by === user.id);
    } else {
      filtered = [];
    }

    if (!supabase) return filtered;

    try {
      let query = supabase.from('customers').select('*');
      if (userRole !== Role.ADMIN) query = query.eq('created_by', user.id);

      const { data, error } = await query;
      if (error) throw error;
      
      const normalizedCustomers = (data || []).map((c: any) => ({
        ...c,
        created_by_role: normalizeRole(c.created_by_role)
      }));
      
      updateLocalCache('pos_customers', normalizedCustomers);
      return normalizedCustomers as Customer[];
    } catch (err) {
      return filtered.map((c: any) => ({
        ...c,
        created_by_role: normalizeRole(c.created_by_role)
      }));
    }
  },

  saveCustomer: async (customer: Customer): Promise<void> => {
    const customers = getLocalCache('pos_customers') || [];
    const index = customers.findIndex((c: any) => c.id === customer.id);
    if (index > -1) customers[index] = customer;
    else customers.push(customer);
    updateLocalCache('pos_customers', customers);

    if (!supabase) return;
    try {
      await supabase.from('customers').upsert(customer);
    } catch (e) {
      console.error("Sync failed for saveCustomer", e);
    }
  },

  bulkTransferCustomers: async (ids: string[], newOwnerId: string, newOwnerRole: Role): Promise<void> => {
    const customers = getLocalCache('pos_customers') || [];
    ids.forEach(id => {
      const index = customers.findIndex((c: any) => c.id === id);
      if (index > -1) {
        customers[index].created_by = newOwnerId;
        customers[index].created_by_role = newOwnerRole;
      }
    });
    updateLocalCache('pos_customers', customers);

    if (!supabase) return;
    try {
      const { error } = await supabase.from('customers').update({ 
        created_by: newOwnerId, 
        created_by_role: newOwnerRole 
      }).in('id', ids);
      if (error) throw error;
    } catch (e) {
      console.error("Sync failed for bulkTransferCustomers", e);
    }
  },

  bulkDeleteCustomers: async (ids: string[]): Promise<void> => {
    const customers = (getLocalCache('pos_customers') || []).filter((c: any) => !ids.includes(c.id));
    updateLocalCache('pos_customers', customers);

    if (!supabase) return;
    try {
      const { error } = await supabase.from('customers').delete().in('id', ids);
      if (error) throw error;
    } catch (e) {
      console.error("Sync failed for bulkDeleteCustomers", e);
    }
  },

  deleteCustomer: async (id: string): Promise<void> => {
    const customers = (getLocalCache('pos_customers') || []).filter((c: any) => c.id !== id);
    updateLocalCache('pos_customers', customers);

    if (!supabase) return;
    try {
      await supabase.from('customers').delete().eq('id', id);
    } catch (e) {
      console.error("Sync failed for deleteCustomer", e);
    }
  },

  createOrder: async (order: Order): Promise<void> => {
    // Update stok lokal
    const prods = getLocalCache('pos_products') || [];
    order.items.forEach(item => {
      const pIndex = prods.findIndex((p: any) => p.id === item.id);
      if (pIndex > -1) prods[pIndex].stock -= item.quantity;
    });
    updateLocalCache('pos_products', prods);

    // Update total belanja pelanggan saja
    if (order.customer_id) {
      const customers = getLocalCache('pos_customers') || [];
      const cIndex = customers.findIndex((c: any) => c.id === order.customer_id);
      if (cIndex > -1) {
        customers[cIndex].total_spent += order.total_amount;
        updateLocalCache('pos_customers', customers);
        
        if (supabase) {
          try {
            await supabase.from('customers').update({ 
              total_spent: customers[cIndex].total_spent
            }).eq('id', order.customer_id);
          } catch (e) {}
        }
      }
    }

    const orders = getLocalCache('pos_orders') || [];
    orders.unshift(order);
    updateLocalCache('pos_orders', orders);

    if (!supabase) return;

    try {
      const { error } = await supabase.from('orders').insert(order);
      if (error) throw error;
      
      for (const item of order.items) {
        const { data: p } = await supabase.from('products').select('stock').eq('id', item.id).single();
        if (p) {
          await supabase.from('products').update({ stock: p.stock - item.quantity }).eq('id', item.id);
        }
      }
    } catch (e) {
      console.error("Order saved locally, sync failed", e);
    }
  },

  getOrders: async (): Promise<Order[]> => {
    if (!supabase) return getLocalCache('pos_orders') || [];
    try {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      updateLocalCache('pos_orders', data);
      return data as Order[];
    } catch (err) {
      return getLocalCache('pos_orders') || [];
    }
  }
};
