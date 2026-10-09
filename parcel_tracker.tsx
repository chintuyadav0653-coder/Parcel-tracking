import React, { useState, useEffect } from 'react';
import { Package, Search, Truck, CheckCircle, MapPin, Clock, Plus, User, ArrowRight, ShieldCheck } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection } from 'firebase/firestore';

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "dummy-key",
    authDomain: "dummy-domain",
    projectId: "dummy-project",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-parcel-app';

const STAGES = [
    'Order Placed',
    'Shipped',
    'In Transit',
    'Out for Delivery',
    'Delivered'
];

const STAGE_COLORS = {
    'Order Placed': 'bg-gray-100 text-gray-800 border-gray-200',
    'Shipped': 'bg-blue-100 text-blue-800 border-blue-200',
    'In Transit': 'bg-amber-100 text-amber-800 border-amber-200',
    'Out for Delivery': 'bg-orange-100 text-orange-800 border-orange-200',
    'Delivered': 'bg-green-100 text-green-800 border-green-200'
};

export default function App() {
    const [user, setUser] = useState(null);
    const [parcels, setParcels] = useState([]);
    const [view, setView] = useState('customer'); // 'customer' | 'staff'
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [searchError, setSearchError] = useState('');
    
    // Form state for new parcel
    const [newParcel, setNewParcel] = useState({ recipient: '', destination: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const initAuth = async () => {
            try {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (err) {
                console.error("Authentication Error:", err);
            }
        };
        initAuth();
        const unsubscribe = onAuthStateChanged(auth, setUser);
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user) return;
        const parcelsRef = collection(db, 'artifacts', appId, 'public', 'data', 'parcels');
        const unsubscribe = onSnapshot(parcelsRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort by creation time descending based on first history entry timestamp
            data.sort((a, b) => new Date(b.history[0]?.timestamp || 0) - new Date(a.history[0]?.timestamp || 0));
            setParcels(data);
        }, (error) => {
            console.error("Firestore Error:", error);
        });
        return () => unsubscribe();
    }, [user]);

    const handleSearch = (e) => {
        e.preventDefault();
        setSearchError('');
        const found = parcels.find(p => p.trackingId.toLowerCase() === searchQuery.trim().toLowerCase());
        if (found) {
            setSearchResult(found);
        } else {
            setSearchResult(null);
            setSearchError('No parcel found with this tracking ID.');
        }
    };

    const handleCreateParcel = async (e) => {
        e.preventDefault();
        if (!user || !newParcel.recipient || !newParcel.destination) return;
        
        setIsSubmitting(true);
        try {
            // Generate a random 8-character alphanumeric tracking ID
            const trackingId = Math.random().toString(36).substring(2, 10).toUpperCase();
            const parcelRef = doc(db, 'artifacts', appId, 'public', 'data', 'parcels', trackingId);
            const now = new Date().toISOString();
            
            await setDoc(parcelRef, {
                trackingId,
                recipient: newParcel.recipient,
                destination: newParcel.destination,
                status: 'Order Placed',
                history: [{
                    stage: 'Order Placed',
                    timestamp: now,
                    location: 'Fulfillment Center',
                    notes: 'Parcel details received and processing started.'
                }]
            });
            
            setNewParcel({ recipient: '', destination: '' });
        } catch (error) {
            console.error("Error creating parcel:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateStatus = async (trackingId, currentStatus) => {
        if (!user) return;
        const currentIndex = STAGES.indexOf(currentStatus);
        if (currentIndex === -1 || currentIndex === STAGES.length - 1) return;
        
        const nextStatus = STAGES[currentIndex + 1];
        const parcel = parcels.find(p => p.trackingId === trackingId);
        if (!parcel) return;

        const parcelRef = doc(db, 'artifacts', appId, 'public', 'data', 'parcels', trackingId);
        const now = new Date().toISOString();
        
        let location = 'Transit Network';
        let notes = 'Parcel is moving through our network.';
        if (nextStatus === 'Shipped') { location = 'Dispatch Center'; notes = 'Parcel has been dispatched.'; }
        if (nextStatus === 'Out for Delivery') { location = 'Local Depot'; notes = 'Parcel is out with the local courier.'; }
        if (nextStatus === 'Delivered') { location = parcel.destination; notes = 'Parcel has been delivered successfully.'; }

        try {
            await updateDoc(parcelRef, {
                status: nextStatus,
                history: [...parcel.history, {
                    stage: nextStatus,
                    timestamp: now,
                    location,
                    notes
                }]
            });
            
            // If the currently viewed search result is this parcel, update it in UI immediately for smooth UX
            if (searchResult && searchResult.trackingId === trackingId) {
                setSearchResult(prev => ({
                    ...prev,
                    status: nextStatus,
                    history: [...prev.history, { stage: nextStatus, timestamp: now, location, notes }]
                }));
            }
        } catch (error) {
            console.error("Error updating status:", error);
        }
    };

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        return {
            date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
            time: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        };
    };

    const getStageIcon = (stage) => {
        switch (stage) {
            case 'Order Placed': return <Package className="w-5 h-5 text-gray-500" />;
            case 'Shipped': return <Truck className="w-5 h-5 text-blue-500" />;
            case 'In Transit': return <Clock className="w-5 h-5 text-amber-500" />;
            case 'Out for Delivery': return <MapPin className="w-5 h-5 text-orange-500" />;
            case 'Delivered': return <CheckCircle className="w-5 h-5 text-green-500" />;
            default: return <Package className="w-5 h-5 text-gray-500" />;
        }
    };

    const renderCustomerView = () => (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in zoom-in duration-300">
            <div className="text-center space-y-4">
                <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Track Your Parcel</h1>
                <p className="text-gray-500">Enter your tracking ID below to see real-time updates.</p>
            </div>

            <form onSubmit={handleSearch} className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-6 w-6 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                    placeholder="e.g. A1B2C3D4"
                    className="block w-full pl-12 pr-32 py-4 text-lg border-2 border-gray-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all outline-none"
                    required
                />
                <button
                    type="submit"
                    className="absolute inset-y-2 right-2 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-colors flex items-center gap-2"
                >
                    Track
                </button>
            </form>

            {searchError && (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl text-center border border-red-100">
                    {searchError}
                </div>
            )}

            {searchResult && (
                <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Tracking ID</p>
                            <p className="text-2xl font-bold text-gray-900 font-mono">{searchResult.trackingId}</p>
                        </div>
                        <div className={`px-4 py-2 rounded-full border font-semibold flex items-center gap-2 ${STAGE_COLORS[searchResult.status]}`}>
                            {getStageIcon(searchResult.status)}
                            {searchResult.status}
                        </div>
                    </div>
                    
                    <div className="p-6 sm:p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div className="flex gap-4 items-start">
                                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><User className="w-6 h-6" /></div>
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Recipient</p>
                                    <p className="font-semibold text-gray-900">{searchResult.recipient}</p>
                                </div>
                            </div>
                            <div className="flex gap-4 items-start">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><MapPin className="w-6 h-6" /></div>
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Destination</p>
                                    <p className="font-semibold text-gray-900">{searchResult.destination}</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[1.4rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
                            {searchResult.history.slice().reverse().map((event, index) => {
                                const isLatest = index === 0;
                                const { date, time } = formatDate(event.timestamp);
                                return (
                                    <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                        <div className="flex items-center justify-center w-12 h-12 rounded-full border-4 border-white bg-white shadow-sm shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isLatest ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                                {getStageIcon(event.stage)}
                                            </div>
                                        </div>
                                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-4 rounded-2xl bg-white border border-gray-100 shadow-sm transition-shadow hover:shadow-md">
                                            <div className="flex justify-between items-center mb-1">
                                                <h4 className={`font-bold ${isLatest ? 'text-gray-900' : 'text-gray-500'}`}>{event.stage}</h4>
                                                <span className="text-xs font-medium text-gray-400">{time}</span>
                                            </div>
                                            <p className="text-sm text-gray-600 mb-2">{event.notes}</p>
                                            <div className="flex justify-between items-center text-xs text-gray-400 font-medium">
                                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</span>
                                                <span>{date}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderStaffView = () => (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-gray-200 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <ShieldCheck className="w-8 h-8 text-indigo-600" />
                        Staff Dashboard
                    </h1>
                    <p className="text-gray-500 mt-2">Manage operations and update parcel statuses.</p>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Create Parcel Form */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sticky top-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <Plus className="w-5 h-5 text-indigo-600" />
                            Create New Parcel
                        </h2>
                        <form onSubmit={handleCreateParcel} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Name</label>
                                <input
                                    type="text"
                                    required
                                    value={newParcel.recipient}
                                    onChange={e => setNewParcel({...newParcel, recipient: e.target.value})}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                    placeholder="e.g. Jane Doe"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Destination Address</label>
                                <textarea
                                    required
                                    rows="3"
                                    value={newParcel.destination}
                                    onChange={e => setNewParcel({...newParcel, destination: e.target.value})}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                                    placeholder="Full delivery address"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSubmitting || !user}
                                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-xl transition-colors shadow-sm flex justify-center items-center gap-2"
                            >
                                {isSubmitting ? 'Creating...' : 'Generate Tracking ID'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Parcels List */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-6">
                        <Package className="w-5 h-5 text-gray-600" />
                        Active Parcels ({parcels.length})
                    </h2>
                    
                    {parcels.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 border border-gray-200 border-dashed rounded-2xl">
                            <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500 font-medium">No parcels created yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {parcels.map(parcel => {
                                const currentIndex = STAGES.indexOf(parcel.status);
                                const isDelivered = currentIndex === STAGES.length - 1;
                                const nextStage = isDelivered ? null : STAGES[currentIndex + 1];
                                
                                return (
                                    <div key={parcel.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className="text-lg font-bold font-mono text-gray-900">{parcel.trackingId}</span>
                                                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${STAGE_COLORS[parcel.status]}`}>
                                                        {parcel.status}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-600 font-medium">{parcel.recipient}</p>
                                            </div>
                                            {!isDelivered && (
                                                <button
                                                    onClick={() => handleUpdateStatus(parcel.trackingId, parcel.status)}
                                                    className="w-full sm:w-auto px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                                                >
                                                    Move to {nextStage}
                                                    <ArrowRight className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                            <MapPin className="w-4 h-4 shrink-0 text-gray-400" />
                                            <span className="truncate">{parcel.destination}</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#F8FAFC] font-sans selection:bg-blue-200">
            {/* Navigation Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm shadow-gray-200/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('customer')}>
                            <div className="bg-blue-600 p-2 rounded-lg">
                                <Package className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold text-gray-900 tracking-tight hidden sm:block">SwiftTrack</span>
                        </div>
                        
                        <div className="flex bg-gray-100 p-1 rounded-xl">
                            <button
                                onClick={() => setView('customer')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === 'customer' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                            >
                                Customer
                            </button>
                            <button
                                onClick={() => setView('staff')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${view === 'staff' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                            >
                                <ShieldCheck className="w-4 h-4" /> Staff
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
                {!user ? (
                    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-gray-500 font-medium animate-pulse">Connecting to services...</p>
                    </div>
                ) : (
                    view === 'customer' ? renderCustomerView() : renderStaffView()
                )}
            </main>
        </div>
    );
}