import { useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import QRCode from "react-qr-code";
import passportTemplate from "./assets/wari-health-passport.jpeg";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  HeartPulse,
  LogOut,
  MapPin,
  Menu,
  Pill,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";

/* =========================================================
   API / HELPERS
   ========================================================= */
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "https://wari-health-passport-production.up.railway.app"

const getInitials = (name = "") => name.split(" ").filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();

const apiFetch = async (path, options = {}, doctor = null) => {
  const headers = { ...(options.headers || {}), "Content-Type": "application/json" };
  if (doctor?.doctor_id) headers["X-Doctor-ID"] = doctor.doctor_id;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data?.message || `Request failed with status ${response.status}`);
  return data;
};

const splitMedications = (value) => String(value || "").split(",").map(x=>x.trim()).filter(Boolean);

const normalizeMedicalRecord = (r={}) => ({
  id:r.record_id, recordId:r.record_id, warkariId:r.warkari_id, doctorId:r.doctor_id,
  doctorName:r.doctor_name || "Medical Officer", doctorSpecialization:r.doctor_specialization || "",
  campId:r.camp_id, campName:r.camp_name || r.camp_id || "Medical Camp", campLocation:r.camp_location || "",
  visitDate:r.visit_date, recordedAt:r.visit_date, symptoms:r.symptoms || "", diagnosis:r.diagnosis || "",
  bloodPressure:r.blood_pressure || "", heartRate:r.heart_rate ?? "", temperature:r.temperature ?? "",
  treatment:r.treatment || "", medications:r.medications || "", remarks:r.remarks || ""
});

const normalizePatient = (p={}, history=[], contact=null) => ({
  id:p.warkari_id, name:p.name||"", age:p.age??"", gender:p.gender||"", bloodGroup:p.blood_group||"",
  allergies:p.allergies||"", medication:p.current_medications||"", chronicIllnesses:p.medical_conditions||"",
  dindi:p.dindi_id||"", emergencyContact:contact?.phone_number||"", emergencyContactName:contact?.contact_name||"",
  emergencyRelationship:contact?.relationship||"", status:p.status||"Active", registeredAt:p.created_at,
  registeredDoctorId:p.registered_doctor_id||"", registeredDoctorName:p.registered_doctor_name||"",
  registeredCampId:p.registered_camp_id||"", registeredCampName:p.registered_camp_name||"",
  medications:splitMedications(p.current_medications), medicalHistory:history.map(normalizeMedicalRecord),
  vitals:history.map(normalizeMedicalRecord), lastVisit:history[0]?.visit_date || p.created_at
});

const loadPatientsFromApi = async (doctor) => {
  const data = await apiFetch("/warkari", {}, doctor);
  return Array.isArray(data) ? data.map(p=>normalizePatient(p,[],null)) : [];
};

const loadPatientDetails = async (id, doctor) => {
  const data = await apiFetch(`/warkari/${encodeURIComponent(id)}`, {}, doctor);
  return normalizePatient(data.profile || {}, data.medical_history || [], data.emergency_contact || null);
};

/* =========================================================
   APP
   ========================================================= */
export default function App() {
  const [route,setRoute]=useState(localStorage.getItem("doctor_logged_in")==="true"?"/doctor":"/login");
  const [doctor,setDoctor]=useState(()=>{try{const s=localStorage.getItem("doctor_session");return s?JSON.parse(s):null;}catch{return null;}});
  const [patients,setPatients]=useState([]);
  const [selectedWarkari,setSelectedWarkari]=useState(null);
  const [generatedPatient,setGeneratedPatient]=useState(null);
  const [loadingPatients,setLoadingPatients]=useState(false);
  const [appError,setAppError]=useState("");

  const navigate=(path)=>{setRoute(path);window.scrollTo({top:0,behavior:"smooth"});};

  const refreshPatients=async()=>{
    if(!doctor?.doctor_id){setPatients([]);return;}
    setLoadingPatients(true);setAppError("");
    try{setPatients(await loadPatientsFromApi(doctor));}
    catch(e){console.error("Could not load Warkaris:",e);setAppError(e.message||"Could not load Warkari records.");}
    finally{setLoadingPatients(false);}
  };

  useEffect(()=>{if(doctor?.doctor_id) refreshPatients();},[doctor?.doctor_id]);

  const logout=()=>{
    localStorage.removeItem("doctor_logged_in");localStorage.removeItem("doctor_session");localStorage.removeItem("selected_warkari");
    setDoctor(null);setPatients([]);setSelectedWarkari(null);setGeneratedPatient(null);setAppError("");setRoute("/login");
  };

  const openPatient=async(patient)=>{
    if(!patient?.id)return;
    try{const fresh=await loadPatientDetails(patient.id,doctor);setSelectedWarkari(fresh);localStorage.setItem("selected_warkari",JSON.stringify(fresh));navigate("/doctor/patient");}
    catch(e){console.error("Could not load Warkari record:",e);alert(e.message||"Could not load this Warkari record.");}
  };

  const addPatient=async(patient)=>{setGeneratedPatient(patient);setSelectedWarkari(patient);localStorage.setItem("selected_warkari",JSON.stringify(patient));await refreshPatients();navigate("/doctor/register/success");};
  const updatePatient=(p)=>{setSelectedWarkari(p);setPatients(prev=>prev.map(x=>x.id===p.id?{...x,...p}:x));localStorage.setItem("selected_warkari",JSON.stringify(p));};

  const deletePatient=async(patient)=>{
    if(!window.confirm(`Are you sure you want to delete ${patient.name} (${patient.id})?\n\nThis will permanently remove the Warkari record.`))return;
    try{await apiFetch(`/warkari/${encodeURIComponent(patient.id)}`,{method:"DELETE"},doctor);setPatients(prev=>prev.filter(x=>x.id!==patient.id));if(selectedWarkari?.id===patient.id){setSelectedWarkari(null);localStorage.removeItem("selected_warkari");}if(generatedPatient?.id===patient.id)setGeneratedPatient(null);alert("Warkari deleted successfully.");}
    catch(e){console.error("Delete Warkari error:",e);alert(e.message||"Could not delete Warkari.");}
  };

  if(route!=="/login"&&!doctor)return <LoginPage onLogin={d=>{setDoctor(d);localStorage.setItem("doctor_logged_in","true");localStorage.setItem("doctor_session",JSON.stringify(d));navigate("/doctor");}}/>;
  if(route==="/login")return <LoginPage onLogin={d=>{setDoctor(d);localStorage.setItem("doctor_logged_in","true");localStorage.setItem("doctor_session",JSON.stringify(d));navigate("/doctor");}}/>;

  if(route==="/doctor")return <DoctorLayout doctor={doctor} onLogout={logout} onNavigate={navigate}>{appError&&<div className="form-error"><AlertCircle size={14}/>{appError}</div>}<DashboardPage patients={patients} onNavigate={navigate} onOpenPatient={openPatient} onDeletePatient={deletePatient}/></DoctorLayout>;
  if(route==="/doctor/register")return <DoctorLayout doctor={doctor} onLogout={logout} onNavigate={navigate}><RegistrationPage doctor={doctor} onBack={()=>navigate("/doctor")} onRegister={addPatient}/></DoctorLayout>;
  if(route==="/doctor/register/success")return <DoctorLayout doctor={doctor} onLogout={logout} onNavigate={navigate}><RegistrationSuccessPage patient={generatedPatient} onScan={()=>navigate("/doctor/scan")} onPatients={()=>navigate("/doctor/patients")} onDashboard={()=>navigate("/doctor")}/></DoctorLayout>;
  if(route==="/doctor/scan")return <DoctorLayout doctor={doctor} onLogout={logout} onNavigate={navigate}><ScannerPage patients={patients} doctor={doctor} onOpenPatient={openPatient} onBack={()=>navigate("/doctor")}/></DoctorLayout>;
  if(route==="/doctor/patients")return <DoctorLayout doctor={doctor} onLogout={logout} onNavigate={navigate}><PatientRecordsPage patients={patients} onOpenPatient={openPatient} onDeletePatient={deletePatient} onRefresh={refreshPatients} loading={loadingPatients} onRegister={()=>navigate("/doctor/register")}/></DoctorLayout>;
  if(route==="/doctor/patient")return <DoctorLayout doctor={doctor} onLogout={logout} onNavigate={navigate}><WarkariProfilePage patient={selectedWarkari} doctor={doctor} onBack={()=>navigate("/doctor/patients")} onUpdate={updatePatient} onOpenPassport={()=>navigate("/doctor/passport")}/></DoctorLayout>;
  if(route==="/doctor/passport")return <DoctorLayout doctor={doctor} onLogout={logout} onNavigate={navigate}><WariHealthPassportPage patient={selectedWarkari} onBack={()=>navigate("/doctor/patient")}/></DoctorLayout>;
  return <DoctorLayout doctor={doctor} onLogout={logout} onNavigate={navigate}><DashboardPage patients={patients} onNavigate={navigate} onOpenPatient={openPatient} onDeletePatient={deletePatient}/></DoctorLayout>;
}

/* =========================================================
   LOGIN
   ========================================================= */

function LoginPage({ onLogin }) {
  const [username,setUsername]=useState("");const [password,setPassword]=useState("");const [showPassword,setShowPassword]=useState(false);const [error,setError]=useState("");const [loading,setLoading]=useState(false);
  const handleSubmit=async(event)=>{event.preventDefault();setError("");if(!username.trim()||!password){setError("Please enter your username and password.");return;}setLoading(true);try{const data=await apiFetch("/doctor/login",{method:"POST",body:JSON.stringify({username:username.trim(),password})});if(!data.doctor?.doctor_id)throw new Error("Login succeeded but doctor information was not returned.");onLogin(data.doctor);}catch(e){console.error("Doctor login error:",e);setError(e.message||"Could not connect to the backend.");}finally{setLoading(false);}};
  return <div className="login-page"><div className="login-card"><div className="brand-mark"><HeartPulse size={25}/></div><div className="login-heading"><span className="eyebrow">WARI MEDICAL PASSPORT</span><h2>Doctor Login</h2><p>Secure access for authorised medical camp personnel.</p></div><form onSubmit={handleSubmit}><label>Username</label><input type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Enter username" autoComplete="username"/><label>Password</label><div className="password-wrapper"><input type={showPassword?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" autoComplete="current-password"/><button type="button" className="password-toggle" onClick={()=>setShowPassword(v=>!v)}>{showPassword?"Hide":"Show"}</button></div>{error&&<div className="error-message"><AlertCircle size={14}/>{error}</div>}<button type="submit" className="primary-button" disabled={loading}><ShieldCheck size={15}/>{loading?"Signing in...":"Sign in"}</button></form><div className="demo-login"><strong>Demo access</strong><span>Username: anjali</span><span>Password: doctor123</span></div></div></div>;
}

/* =========================================================
   COMMON HEADER
   ========================================================= */

function DoctorLayout({
  doctor,
  onLogout,
  onNavigate,
  children,
}) {
  return (
    <div>
      <header className="main-header">
        <button
          className="header-brand"
          onClick={() => onNavigate("/doctor")}
          type="button"
        >
          <div className="small-brand-icon">
            <HeartPulse size={18} />
          </div>

          <div>
            <strong>Wari Medical Passport</strong>
            <span>Medical Camp Portal</span>
          </div>
        </button>

        <div className="doctor-header">
          <div className="doctor-info">
            <strong>{doctor?.name}</strong>
            <span>{doctor?.camp}</span>
          </div>

          <button
            className="logout-button"
            onClick={onLogout}
            type="button"
          >
            <LogOut size={13} />
            Logout
          </button>
        </div>
      </header>

      {children}
    </div>
  );
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function DashboardPage({
  patients,
  onNavigate,
  onOpenPatient,
  onDeletePatient,
}) {
  const recentPatients = patients.slice(0, 5);

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">
        <div className="dashboard-heading">
          <span className="eyebrow">
            MEDICAL CAMP / DOCTOR PORTAL
          </span>

          <h1>Doctor Dashboard</h1>

          <p>
            Register Warkaris, scan medical passport QR
            codes and access patient records.
          </p>
        </div>

        <div className="dashboard-stats">
          <div className="stat-card">
            <div className="stat-icon">
              <Users size={19} />
            </div>

            <div>
              <span>Total Warkaris</span>
              <strong>{patients.length}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <UserPlus size={19} />
            </div>

            <div>
              <span>Registered</span>
              <strong>{patients.length}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <QrCode size={19} />
            </div>

            <div>
              <span>QR Enabled</span>
              <strong>{patients.length}</strong>
            </div>
          </div>
        </div>

        <div className="dashboard-grid">
          <button
            className="dashboard-action-card"
            type="button"
            onClick={() => onNavigate("/doctor/register")}
          >
            <UserPlus size={22} />
            <strong>Register Warkari</strong>
            <span>
              Create a new medical passport and QR ID.
            </span>
          </button>

          <button
            className="dashboard-action-card"
            type="button"
            onClick={() => onNavigate("/doctor/scan")}
          >
            <QrCode size={22} />
            <strong>Scan QR</strong>
            <span>
              Access an existing Warkari medical record.
            </span>
          </button>

          <button
            className="dashboard-action-card"
            type="button"
            onClick={() => onNavigate("/doctor/patients")}
          >
            <ClipboardList size={22} />
            <strong>Patient Records</strong>
            <span>
              Search and view registered Warkaris.
            </span>
          </button>
        </div>

        <div className="dashboard-section">
          <div className="section-heading">
            <div>
              <h2>Recently Registered</h2>
              <p>Latest Warkaris registered at this camp.</p>
            </div>

            <button
              className="secondary-button"
              type="button"
              onClick={() => onNavigate("/doctor/patients")}
            >
              View all
            </button>
          </div>

          {recentPatients.length === 0 ? (
            <div className="empty-dashboard">
              <Users size={30} />
              <h3>No Warkaris registered yet</h3>
              <p>
                Register the first Warkari to begin testing
                the medical passport system.
              </p>

              <button
                className="primary-button"
                type="button"
                onClick={() => onNavigate("/doctor/register")}
              >
                <UserPlus size={14} />
                Register Warkari
              </button>
            </div>
          ) : (
            <div className="recent-patients">

              {recentPatients.map((patient) => (

                <div
                  key={patient.id}
                  className="recent-patient-row"
                >

                  <div className="small-patient-avatar">
                    {getInitials(patient.name)}
                  </div>


                  <button
                    className="recent-patient-info"
                    type="button"
                    onClick={() => onOpenPatient(patient)}
                  >
                    <strong>{patient.name}</strong>

                    <span>
                      {patient.id}
                      {patient.dindi
                        ? ` · Dindi ${patient.dindi}`
                        : ""}
                    </span>
                  </button>


                  <div className="recent-patient-actions">

                    <span className="registered-status">
                      <CheckCircle2 size={12} />
                      Registered
                    </span>


                    <button
                      className="recent-view-button"
                      type="button"
                      onClick={() => onOpenPatient(patient)}
                    >
                      View
                    </button>


                    <button
                      className="recent-delete-button"
                      type="button"
                      onClick={() => onDeletePatient(patient)}
                    >
                      <X size={13} />
                      Delete
                    </button>

                  </div>

                </div>

              ))}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   REGISTRATION
   ========================================================= */

function RegistrationPage({ doctor, onBack, onRegister }) {
  const [form, setForm] = useState({
    name: "",
    age: "",
    gender: "",
    bloodGroup: "",
    emergencyContact: "",
    allergies: "",
    medication: "",
    chronicIllnesses: "",
    dindi: "",
  });

  const [error, setError] = useState("");

  const updateField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (
      !form.name.trim() ||
      !form.age ||
      !form.gender ||
      !form.bloodGroup ||
      !form.emergencyContact
    ) {
      setError(
        "Please complete all required fields before registering."
      );
      return;
    }

    try {
      const response = await fetch(
        "https://wari-health-passport-production.up.railway.app",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Doctor-ID": doctor?.doctor_id || "",
          },
          body: JSON.stringify({
            name: form.name.trim(),
            age: Number(form.age),
            gender: form.gender,
            blood_group: form.bloodGroup,

            medical_conditions:
              form.chronicIllnesses.trim() || null,

            allergies:
              form.allergies.trim() || null,

            current_medications:
              form.medication.trim() || null,

            dindi_id: form.dindi.trim() || null,
            doctor_id: doctor?.doctor_id || null,
            camp_id: doctor?.camp_id || null,

            // Emergency contact table
            contact_name: "Emergency Contact",
            relationship: "Emergency",
            phone_number: form.emergencyContact.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Could not register Warkari."
        );
      }

      /*
       * IMPORTANT:
       * Use the ID generated by MySQL/backend.
       * Do NOT generate another ID in React.
       */
      const patient = await loadPatientDetails(data.warkari_id, doctor);

      console.log(
        "✅ Warkari successfully registered:",
        data.warkari_id
      );

      onRegister(patient);

    } catch (error) {
      console.error("❌ Registration error:", error);

      setError(
        error.message ||
        "Could not connect to the server. Please make sure the backend is running."
      );
    }
  };

  return (
    <div className="registration-page">
      <div className="registration-container">
        <div className="inner-header">
          <button
            className="back-button"
            type="button"
            onClick={onBack}
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </button>

          <div>
            <span className="eyebrow">
              NEW MEDICAL PASSPORT
            </span>

            <h1>Register Warkari</h1>

            <p>
              Create the Warkari's unique medical identity.
            </p>
          </div>
        </div>

        {error && (
          <div className="form-error">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <div className="form-section-heading">
              <User size={17} />

              <div>
                <h3>Basic Information</h3>
                <p>
                  Identification details of the Warkari.
                </p>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>
                  Full Name <span className="required">*</span>
                </label>

                <input
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    updateField("name", event.target.value)
                  }
                  placeholder="Enter full name"
                />
              </div>

              <div className="form-field">
                <label>
                  Age <span className="required">*</span>
                </label>

                <input
                  type="number"
                  min="1"
                  max="120"
                  value={form.age}
                  onChange={(event) =>
                    updateField("age", event.target.value)
                  }
                  placeholder="Age"
                />
              </div>

              <div className="form-field">
                <label>
                  Gender <span className="required">*</span>
                </label>

                <select
                  value={form.gender}
                  onChange={(event) =>
                    updateField("gender", event.target.value)
                  }
                >
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-field">
                <label>
                  Blood Group{" "}
                  <span className="required">*</span>
                </label>

                <select
                  value={form.bloodGroup}
                  onChange={(event) =>
                    updateField(
                      "bloodGroup",
                      event.target.value
                    )
                  }
                >
                  <option value="">Select blood group</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>

              <div className="form-field">
                <label>
                  Emergency Contact{" "}
                  <span className="required">*</span>
                </label>

                <input
                  type="tel"
                  value={form.emergencyContact}
                  onChange={(event) =>
                    updateField(
                      "emergencyContact",
                      event.target.value
                    )
                  }
                  placeholder="Emergency contact number"
                />
              </div>

              <div className="form-field">
                <label>
                  Dindi Number{" "}
                  <span className="required">*</span>
                </label>

                <input
                  type="text"
                  value={form.dindi}
                  onChange={(event) =>
                    updateField("dindi", event.target.value)
                  }
                  placeholder="e.g. D-023"
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-heading">
              <HeartPulse size={17} />

              <div>
                <h3>Medical Information</h3>
                <p>
                  Existing medical information available at
                  registration.
                </p>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field full-field">
                <label>Allergies</label>

                <textarea
                  rows="3"
                  value={form.allergies}
                  onChange={(event) =>
                    updateField(
                      "allergies",
                      event.target.value
                    )
                  }
                  placeholder="List known allergies, or write 'None known'"
                />
              </div>

              <div className="form-field full-field">
                <label>Ongoing Medication</label>

                <textarea
                  rows="3"
                  value={form.medication}
                  onChange={(event) =>
                    updateField(
                      "medication",
                      event.target.value
                    )
                  }
                  placeholder="e.g. Metformin 500mg, Amlodipine 5mg"
                />
              </div>

              <div className="form-field full-field">
                <label>Chronic Illnesses / Diseases</label>

                <textarea
                  rows="3"
                  value={form.chronicIllnesses}
                  onChange={(event) =>
                    updateField(
                      "chronicIllnesses",
                      event.target.value
                    )
                  }
                  placeholder="e.g. Diabetes, hypertension, asthma, or None"
                />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onBack}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary-button"
            >
              <UserPlus size={14} />
              Create Medical Passport
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   REGISTRATION SUCCESS / QR
   ========================================================= */

function RegistrationSuccessPage({
  patient,
  onScan,
  onPatients,
  onDashboard,
}) {
  if (!patient) {
    return (
      <div className="success-page">
        <div className="success-card">
          <AlertCircle size={35} />

          <h1>No Registration Found</h1>

          <p>
            There is no recently generated Warkari ID.
          </p>

          <button
            className="primary-button"
            type="button"
            onClick={onDashboard}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const printPassport = () => {
    window.print();
  };

  return (
    <div className="success-page">

      {/* =====================================================
          PRINTABLE WARI HEALTH PASSPORT
          ===================================================== */}

      <div className="passport-wrapper">

        <div className="wari-passport" id="wari-passport">

          {/* TOP GREEN HEADER */}
          <div className="passport-header">

            <div className="passport-symbol">
              <HeartPulse size={42} strokeWidth={2.2} />
            </div>

            <div className="passport-line">
              <span></span>
              <span></span>
            </div>

            <h1>WARI HEALTH</h1>
            <h2>PASSPORT</h2>

            <div className="passport-curve"></div>

          </div>


          {/* QR SECTION */}
          <div className="passport-qr-section">

            <div className="passport-qr-box">
              <QRCode
                value={patient.id}
                size={190}
                level="H"
              />
            </div>

          </div>


          {/* DECORATIVE DIVIDER */}
          <div className="passport-divider">
            <span></span>
            <strong>•</strong>
            <span></span>
          </div>


          {/* ID */}
          <div className="passport-field">

            <div className="passport-field-icon">
              <ClipboardList size={28} />
            </div>

            <div className="passport-field-content">
              <span>WARI HEALTH ID</span>
              <strong>{patient.id}</strong>
            </div>

          </div>


          {/* NAME */}
          <div className="passport-field">

            <div className="passport-field-icon">
              <User size={28} />
            </div>

            <div className="passport-field-content">
              <span>NAME</span>
              <strong>{patient.name}</strong>
            </div>

          </div>


          {/* BOTTOM DECORATION */}
          <div className="passport-bottom-decoration">
            <span></span>
            <strong>✦</strong>
            <span></span>
          </div>

        </div>


        {/* ACTION BUTTONS - NOT PRINTED */}
        <div className="passport-actions">

          <button
            className="primary-button"
            type="button"
            onClick={printPassport}
          >
            <Printer size={15} />
            Print / Save as PDF
          </button>

          <button
            className="secondary-button"
            type="button"
            onClick={onScan}
          >
            <QrCode size={15} />
            Test Scanner
          </button>

          <button
            className="secondary-button"
            type="button"
            onClick={onPatients}
          >
            <ClipboardList size={15} />
            Patient Records
          </button>

          <button
            className="secondary-button"
            type="button"
            onClick={onDashboard}
          >
            Dashboard
          </button>

        </div>

      </div>

    </div>
  );
}
/* =========================================================
   QR SCANNER
   ========================================================= */

function ScannerPage({
  patients,
  doctor,
  onOpenPatient,
  onBack,
}) {
  const [manualId, setManualId] = useState("");
  const [scannerStatus, setScannerStatus] = useState(
    "Ready to scan"
  );
  const [cameraError, setCameraError] = useState("");
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const scanningRef = useRef(false);

  const stopCamera = () => {
    scanningRef.current = false;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setScannerStatus("Camera stopped.");
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const findPatientById = async (id) => {
    const cleanedId = id.trim();
    if (!cleanedId) { setScannerStatus("Please enter a Warkari ID."); return; }
    setScannerStatus("Looking up Warkari record...");
    try {
      const patient = await loadPatientDetails(cleanedId, doctor);
      stopCamera();
      setScannerStatus(`Record found for ${patient.name}.`);
      onOpenPatient(patient);
    } catch (error) {
      console.error("QR/manual Warkari lookup error:", error);
      setScannerStatus(error.message || "No Warkari record was found for this QR/ID.");
    }
  };

  const startCamera = async () => {
    setCameraError("");
    setScannerStatus("Starting camera...");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera access is not supported by this browser."
      );
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
          },
          audio: false,
        });

      streamRef.current = stream;

      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());

        setCameraError(
          "Camera preview could not be initialized."
        );

        return;
      }

      videoRef.current.srcObject = stream;

      await videoRef.current.play();

      setCameraActive(true);
      setScannerStatus(
        "Camera active. Point it at a Warkari QR code."
      );

      /*
       * -------------------------------------------------------
       * QR CODE SCANNING USING jsQR
       * -------------------------------------------------------
       */

      scanningRef.current = true;

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      const scanFrame = () => {
        if (
          !scanningRef.current ||
          !videoRef.current ||
          !streamRef.current
        ) {
          return;
        }

        const video = videoRef.current;

        if (
          video.readyState >= 2 &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
          );

          const imageData = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );

          const qrCode = jsQR(
            imageData.data,
            imageData.width,
            imageData.height,
            {
              inversionAttempts: "attemptBoth",
            }
          );

          if (qrCode && qrCode.data) {
            console.log(
              "QR Code detected:",
              qrCode.data
            );

            scanningRef.current = false;

            findPatientById(qrCode.data);

            return;
          }
        }

        animationRef.current =
          requestAnimationFrame(scanFrame);
      };

      animationRef.current =
        requestAnimationFrame(scanFrame);

    } catch (error) {
      console.error("Camera error:", error);

      setCameraActive(false);

      if (error.name === "NotAllowedError") {
        setCameraError(
          "Camera permission was denied. Please allow camera access."
        );
      } else if (error.name === "NotFoundError") {
        setCameraError(
          "No camera was found on this device."
        );
      } else if (error.name === "NotReadableError") {
        setCameraError(
          "The camera is already being used by another application."
        );
      } else {
        setCameraError(
          "Camera could not be opened. Please check your camera permissions."
        );
      }

      setScannerStatus("Camera failed to start.");
    }
  };

  return (
    <div className="scanner-page">
      <div className="scanner-container">
        <div className="inner-header">
          <button
            className="back-button"
            type="button"
            onClick={onBack}
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </button>

          <div>
            <span className="eyebrow">
              MEDICAL PASSPORT ACCESS
            </span>

            <h1>Scan Warkari QR</h1>

            <p>
              Scan the unique medical passport QR code to
              open the Warkari's record.
            </p>
          </div>
        </div>

        <div className="scanner-layout">
          <div className="scanner-card">
            <div className="scanner-heading">
              <div className="scanner-icon">
                <QrCode size={19} />
              </div>

              <div>
                <h2>QR Scanner</h2>

                <p>
                  Use the medical camp device camera to scan
                  the Warkari's QR.
                </p>
              </div>
            </div>

            <div className="qr-reader">
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                style={{
                  display: cameraActive ? "block" : "none",
                  width: "100%",
                  height: "310px",
                  objectFit: "cover",
                  background: "#0b1720",
                }}
              />

              {!cameraActive && (
                <div className="scanner-placeholder">
                  <QrCode size={45} />

                  <strong>Camera Scanner</strong>

                  <span>
                    Press the button below to activate the
                    device camera.
                  </span>
                </div>
              )}
            </div>

            {!cameraActive ? (
              <button
                className="primary-button"
                type="button"
                onClick={startCamera}
              >
                <QrCode size={14} />
                Start Camera
              </button>
            ) : (
              <button
                className="secondary-button"
                type="button"
                onClick={stopCamera}
              >
                <X size={14} />
                Stop Camera
              </button>
            )}

            {cameraError && (
              <div className="form-error">
                <AlertCircle size={14} />
                {cameraError}
              </div>
            )}

            <div className="scanner-note">
              <Activity size={15} />

              <p>
                Scanner status: <strong>{scannerStatus}</strong>
              </p>
            </div>
          </div>

          <div className="manual-search-card">
            <div className="scanner-heading">
              <div className="scanner-icon">
                <Search size={18} />
              </div>

              <div>
                <h2>Manual ID Search</h2>

                <p>
                  Use this when a physical QR scanner is
                  connected or the camera is unavailable.
                </p>
              </div>
            </div>

            <label>Warkari ID</label>

            <input
              type="text"
              value={manualId}
              onChange={(event) =>
                setManualId(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  findPatientById(manualId);
                }
              }}
              placeholder="e.g. WRK-12345678-123"
            />

            <button
              className="primary-button"
              type="button"
              onClick={() => findPatientById(manualId)}
            >
              <Search size={14} />
              Find Record
            </button>

            <div className="scanner-note">
              <FileText size={15} />

              <p>
                QR data is resolved against the secure medical camp
                backend. Access is checked using the logged-in
                doctor's camp and identity.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PATIENT RECORDS
   ========================================================= */

function PatientRecordsPage({
  patients,
  onOpenPatient,
  onDeletePatient,
  onRefresh,
  loading,
  onRegister,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dindiFilter, setDindiFilter] = useState("all");

  const dindis = useMemo(() => {
    return [
      ...new Set(
        patients
          .map((patient) => patient.dindi)
          .filter(Boolean)
      ),
    ].sort();
  }, [patients]);

  const filteredPatients = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return patients.filter((patient) => {
      const matchesSearch =
        !search ||
        patient.name.toLowerCase().includes(search) ||
        patient.id.toLowerCase().includes(search) ||
        patient.dindi.toLowerCase().includes(search);

      const matchesDindi =
        dindiFilter === "all" ||
        patient.dindi === dindiFilter;

      return matchesSearch && matchesDindi;
    });
  }, [patients, searchTerm, dindiFilter]);

  return (
    <div className="patients-page">
      <div className="patients-container">
        <div className="inner-header">
          <div>
            <span className="eyebrow">
              MEDICAL RECORD DATABASE
            </span>

            <h1>Patient Records</h1>

            <p>
              Registered Warkaris available to this medical
              camp.
            </p>
          </div>

          <button
            className="primary-button"
            type="button"
            onClick={onRegister}
          >
            <UserPlus size={14} />
            Register Warkari
          </button>
        </div>

        <div className="records-summary">
          <div className="summary-card">
            <div className="summary-icon">
              <Users size={18} />
            </div>

            <div>
              <span>Total Records</span>
              <strong>{patients.length}</strong>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">
              <Users size={18} />
            </div>

            <div>
              <span>Dindis</span>
              <strong>{dindis.length}</strong>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">
              <CheckCircle2 size={18} />
            </div>

            <div>
              <span>Active</span>
              <strong>{patients.length}</strong>
            </div>
          </div>
        </div>

        <div className="patient-tools">
          <div className="patient-search">
            <Search size={15} />

            <input
              type="text"
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
              placeholder="Search by name, Warkari ID or Dindi..."
            />
          </div>

          <div className="dindi-filter">
            <Menu size={14} />

            <select
              value={dindiFilter}
              onChange={(event) =>
                setDindiFilter(event.target.value)
              }
            >
              <option value="all">All Dindis</option>

              {dindis.map((dindi) => (
                <option key={dindi} value={dindi}>
                  {dindi}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="patients-table-card">
          <div className="table-header">
            <div>
              <h2>Registered Warkaris</h2>
              <p>
                {filteredPatients.length} record
                {filteredPatients.length === 1 ? "" : "s"}{" "}
                displayed
              </p>
            </div>

            <button
              className="refresh-button"
              type="button"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw size={12} />
              loading ? "Loading..." : "Refresh"
            </button>
          </div>

          {filteredPatients.length === 0 ? (
            <div className="empty-patients">
              <Users size={35} />

              <h3>No matching records</h3>

              <p>
                Register a Warkari or change your search
                filters.
              </p>

              <button
                className="primary-button"
                type="button"
                onClick={onRegister}
              >
                <UserPlus size={14} />
                Register Warkari
              </button>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="patients-table">
                <thead>
                  <tr>
                    <th>Warkari</th>
                    <th>Warkari ID</th>
                    <th>Age</th>
                    <th>Blood Group</th>
                    <th>Dindi</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredPatients.map((patient) => (
                    <tr key={patient.id}>
                      <td>
                        <div className="patient-table-name">
                          <div className="small-patient-avatar">
                            {getInitials(patient.name)}
                          </div>

                          <div>
                            <strong>{patient.name}</strong>

                            <span>
                              {patient.gender}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="wari-id">
                          {patient.id}
                        </span>
                      </td>

                      <td>{patient.age}</td>

                      <td>
                        <span className="blood-group">
                          {patient.bloodGroup}
                        </span>
                      </td>

                      <td>
                        <span className="dindi-badge">
                          {patient.dindi}
                        </span>
                      </td>

                      <td>
                        <span className="registered-status">
                          <CheckCircle2 size={12} />
                          {patient.status}
                        </span>
                      </td>

                      <td>
                        <div className="patient-actions">

                          <button
                            className="view-patient-button"
                            type="button"
                            onClick={() =>
                              onOpenPatient(patient)
                            }
                          >
                            View Record
                          </button>

                          <button
                            className="delete-patient-button"
                            type="button"
                            onClick={() =>
                              onDeletePatient(patient)
                            }
                          >
                            <X size={13} />
                            Delete
                          </button>

                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   WARKARI PROFILE
   ========================================================= */

function WarkariProfilePage({
  patient,
  doctor,
  onBack,
  onUpdate,
  onOpenPassport,
}) {
  const [newMedication, setNewMedication] =
    useState("");

  const [showMedicationSuggestions, setShowMedicationSuggestions] =
    useState(false);

  const medicineList = [
    "Paracetamol 500 mg",
    "Paracetamol 650 mg",
    "Ibuprofen 200 mg",
    "Ibuprofen 400 mg",
    "Aspirin 75 mg",
    "Cetirizine 10 mg",
    "Levocetirizine 5 mg",
    "Omeprazole 20 mg",
    "Pantoprazole 40 mg",
    "ORS",
    "Amoxicillin 500 mg",
    "Azithromycin 500 mg",
    "Metformin 500 mg",
    "Amlodipine 5 mg",
    "Atorvastatin 10 mg",
    "Diclofenac 50 mg",
    "Antacid",
    "Multivitamin",
  ];

  const filteredMedicines = medicineList.filter((medicine) =>
    medicine
      .toLowerCase()
      .includes(newMedication.trim().toLowerCase())
  );

  const [vitalsForm, setVitalsForm] = useState({
    temperature: "",
    pulse: "",
    bloodPressure: "",
    spo2: "",
    weight: "",
    notes: "",
  });

  if (!patient) {
    return (
      <div className="profile-page">
        <div className="profile-container">
          <div className="profile-card">
            <AlertCircle size={30} />

            <h2>Warkari record not selected</h2>

            <button
              className="primary-button"
              type="button"
              onClick={onBack}
            >
              Back to Patient Records
            </button>
          </div>
        </div>
      </div>
    );
  }

  const addMedication = () => {
    const medication = newMedication.trim();

    if (!medication) {
      return;
    }

    const updatedPatient = {
      ...patient,
      medications: [
        ...(patient.medications || []),
        medication,
      ],
      medication: [
        ...(patient.medications || []),
        medication,
      ].join(", "),
      lastVisit: new Date().toISOString(),
    };

    onUpdate(updatedPatient);
    setNewMedication("");
  };

  const removeMedication = (index) => {
    const updatedMedications = [
      ...(patient.medications || []),
    ];

    updatedMedications.splice(index, 1);

    onUpdate({
      ...patient,
      medications: updatedMedications,
      medication: updatedMedications.join(", "),
    });
  };

  const addVitals = async (event) => {
    event.preventDefault();
    const hasValue = Object.values(vitalsForm).some(value => String(value).trim() !== "");
    if (!hasValue) return;
    try {
      const temperatureValue = parseFloat(String(vitalsForm.temperature).replace(/[^\d.-]/g, ""));
      const pulseValue = parseInt(String(vitalsForm.pulse).replace(/[^\d]/g, ""), 10);
      const data = await apiFetch(`/warkari/${encodeURIComponent(patient.id)}/medical-record`, {
        method:"POST",
        body:JSON.stringify({
          symptoms:null, diagnosis:null,
          blood_pressure:vitalsForm.bloodPressure.trim() || null,
          heart_rate:Number.isFinite(pulseValue) ? pulseValue : null,
          temperature:Number.isFinite(temperatureValue) ? temperatureValue : null,
          treatment:null, medications:null,
          remarks:[vitalsForm.notes.trim(),vitalsForm.spo2.trim()?`SpO₂: ${vitalsForm.spo2.trim()}`:"",vitalsForm.weight.trim()?`Weight: ${vitalsForm.weight.trim()}`:""].filter(Boolean).join(" · ") || null
        })
      }, doctor);
      const fresh = await loadPatientDetails(patient.id, doctor);
      onUpdate(fresh);
      setVitalsForm({temperature:"",pulse:"",bloodPressure:"",spo2:"",weight:"",notes:""});
      alert(data.message || "Medical record saved successfully.");
    } catch (error) {
      console.error("Save medical record error:", error);
      alert(error.message || "Could not save the medical record.");
    }
  };

  return (
    <div className="profile-page">
      <div className="profile-container">
        <button
          className="back-button"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft size={14} />
          Back to Patient Records
        </button>

        <div className="profile-card">
          <div className="identity-card">
            <div className="patient-avatar">
              <User size={27} />
            </div>

            <div className="patient-name">
              <span>Warkari Medical Passport</span>

              <h2>{patient.name}</h2>

              <strong>{patient.id}</strong>
            </div>

            <div className="patient-status">
              <CheckCircle2 size={13} />
              Active Record
            </div>
          </div>
        </div>
        <div className="profile-card record-qr-card">

          <div className="profile-section-title">
            <QrCode size={17} />

            <div>
              <h2>Wari Health QR</h2>
              <p>
                Scan this QR code to access this Warkari's medical record.
              </p>
            </div>
          </div>

          <div className="record-qr-content">

            <div className="record-qr-left">

              <div
                className="record-qr-box"
                id="record-qr-print"
              >
                <QRCode
                  value={patient.id}
                  size={190}
                  level="H"
                />
              </div>

              <div className="record-qr-actions">

                <button
                  type="button"
                  className="qr-print-button"
                  onClick={onOpenPassport}
                >
                  <Printer size={14} />
                  Print ID
                </button>

              </div>

            </div>

            <div className="record-qr-details">

              <span>WARI HEALTH ID</span>

              <strong>{patient.id}</strong>

              <p>
                This QR code is permanently linked to this
                Warkari's medical passport.
              </p>

            </div>

          </div>

        </div>
        <div className="profile-card">
          <div className="profile-section-title">
            <User size={17} />

            <div>
              <h2>Personal Information</h2>
              <p>
                Basic identification and emergency
                information.
              </p>
            </div>
          </div>

          <div className="profile-grid">
            <ProfileField
              label="Full Name"
              value={patient.name}
            />

            <ProfileField
              label="Age"
              value={`${patient.age} years`}
            />

            <ProfileField
              label="Gender"
              value={patient.gender}
            />

            <ProfileField
              label="Blood Group"
              value={patient.bloodGroup}
            />

            <ProfileField
              label="Dindi"
              value={patient.dindi}
            />

            <ProfileField
              label="Emergency Contact"
              value={patient.emergencyContact}
            />
          </div>
        </div>

        <div className="emergency-card">
          <div className="emergency-icon">
            <AlertCircle size={20} />
          </div>

          <div>
            <span>Emergency Contact</span>

            <strong>
              {patient.emergencyContact}
            </strong>
          </div>
        </div>

        <div className="profile-card">
          <div className="profile-section-title">
            <HeartPulse size={17} />

            <div>
              <h2>Medical Information</h2>
              <p>
                Important information available to medical
                personnel.
              </p>
            </div>
          </div>

          <div className="medical-info-grid">
            <MedicalInformation
              icon={<Activity size={17} />}
              label="Allergies"
              value={
                patient.allergies || "None recorded"
              }
            />

            <MedicalInformation
              icon={<Pill size={17} />}
              label="Ongoing Medication"
              value={
                patient.medication ||
                "No medication recorded"
              }
            />

            <MedicalInformation
              icon={<HeartPulse size={17} />}
              label="Chronic Illnesses"
              value={
                patient.chronicIllnesses ||
                "None recorded"
              }
            />
          </div>
        </div>

        <div className="profile-card">
          <div className="profile-section-title">
            <Pill size={17} />

            <div>
              <h2>Current Medications</h2>
              <p>
                Medications currently recorded for this
                Warkari.
              </p>
            </div>
          </div>

          {patient.medications?.length > 0 ? (
            <div className="medication-list">
              {patient.medications.map(
                (medication, index) => (
                  <div
                    className="medication-row"
                    key={`${medication}-${index}`}
                  >
                    <Pill size={14} />

                    <span>{medication}</span>

                    <button
                      type="button"
                      onClick={() =>
                        removeMedication(index)
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="muted-text">
              No current medication recorded.
            </p>
          )}

          <div className="medication-search-wrapper">

            <div className="inline-form">

              <input
                type="text"
                value={newMedication}
                onChange={(event) => {
                  setNewMedication(event.target.value);
                  setShowMedicationSuggestions(true);
                }}
                onFocus={() => {
                  setShowMedicationSuggestions(true);
                }}
                placeholder="Search medication..."
                autoComplete="off"
              />

              <button
                className="primary-button"
                type="button"
                onClick={addMedication}
              >
                <Pill size={14} />
                Add
              </button>

            </div>


            {showMedicationSuggestions &&
              newMedication.trim() !== "" &&
              filteredMedicines.length > 0 && (

                <div className="medication-suggestions">

                  {filteredMedicines.map((medicine) => (

                    <button
                      key={medicine}
                      type="button"
                      className="medication-suggestion"
                      onClick={() => {
                        setNewMedication(medicine);
                        setShowMedicationSuggestions(false);
                      }}
                    >
                      <Pill size={14} />
                      <span>{medicine}</span>
                    </button>

                  ))}

                </div>

              )}

          </div>
        </div>

        <div className="profile-card">
          <div className="profile-section-title">
            <Activity size={17} />

            <div>
              <h2>Record New Vitals</h2>
              <p>
                Add the Warkari's current medical
                observations from this camp visit.
              </p>
            </div>
          </div>

          <form onSubmit={addVitals}>
            <div className="form-grid">
              <div className="form-field">
                <label>Temperature</label>

                <input
                  type="text"
                  value={vitalsForm.temperature}
                  onChange={(event) =>
                    setVitalsForm((previous) => ({
                      ...previous,
                      temperature: event.target.value,
                    }))
                  }
                  placeholder="e.g. 98.6 °F"
                />
              </div>

              <div className="form-field">
                <label>Pulse</label>

                <input
                  type="text"
                  value={vitalsForm.pulse}
                  onChange={(event) =>
                    setVitalsForm((previous) => ({
                      ...previous,
                      pulse: event.target.value,
                    }))
                  }
                  placeholder="e.g. 76 bpm"
                />
              </div>

              <div className="form-field">
                <label>Blood Pressure</label>

                <input
                  type="text"
                  value={vitalsForm.bloodPressure}
                  onChange={(event) =>
                    setVitalsForm((previous) => ({
                      ...previous,
                      bloodPressure:
                        event.target.value,
                    }))
                  }
                  placeholder="e.g. 120/80"
                />
              </div>

              <div className="form-field">
                <label>SpO₂</label>

                <input
                  type="text"
                  value={vitalsForm.spo2}
                  onChange={(event) =>
                    setVitalsForm((previous) => ({
                      ...previous,
                      spo2: event.target.value,
                    }))
                  }
                  placeholder="e.g. 98%"
                />
              </div>

              <div className="form-field">
                <label>Weight</label>

                <input
                  type="text"
                  value={vitalsForm.weight}
                  onChange={(event) =>
                    setVitalsForm((previous) => ({
                      ...previous,
                      weight: event.target.value,
                    }))
                  }
                  placeholder="e.g. 65 kg"
                />
              </div>

              <div className="form-field full-field">
                <label>Doctor Notes</label>

                <textarea
                  rows="3"
                  value={vitalsForm.notes}
                  onChange={(event) =>
                    setVitalsForm((previous) => ({
                      ...previous,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Observations, treatment or other notes"
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
              >
                <Activity size={14} />
                Save Vitals
              </button>
            </div>
          </form>
        </div>

        <div className="profile-card">
          <div className="profile-section-title">
            <FileText size={17} />
            <div>
              <h2>Medical History</h2>
              <p>Previous visits recorded across Wari medical camps.</p>
            </div>
          </div>
          {patient.medicalHistory?.length ? (
            <div className="vitals-history">
              {patient.medicalHistory.map((record) => (
                <div className="vitals-record" key={record.id}>
                  <div>
                    <strong>{record.visitDate ? new Date(record.visitDate).toLocaleString() : "Visit date unavailable"}</strong>
                    <p><strong>Camp:</strong> {record.campName || "—"}{record.campLocation ? ` · ${record.campLocation}` : ""}</p>
                    <p><strong>Doctor:</strong> {record.doctorName || "—"}{record.doctorSpecialization ? ` · ${record.doctorSpecialization}` : ""}</p>
                    {record.symptoms && <p><strong>Symptoms:</strong> {record.symptoms}</p>}
                    {record.diagnosis && <p><strong>Diagnosis:</strong> {record.diagnosis}</p>}
                    {(record.bloodPressure || record.heartRate || record.temperature) && <p><strong>Vitals:</strong> BP {record.bloodPressure || "—"} · HR {record.heartRate || "—"} · Temp {record.temperature || "—"}</p>}
                    {record.treatment && <p><strong>Treatment:</strong> {record.treatment}</p>}
                    {record.medications && <p><strong>Medications:</strong> {record.medications}</p>}
                    {record.remarks && <p><strong>Remarks:</strong> {record.remarks}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-patients"><FileText size={28}/><h3>No medical history recorded</h3><p>Previous camp visits will appear here once medical records are saved.</p></div>
          )}
        </div>

        <div className="profile-card">
          <div className="profile-section-title">
            <CalendarDays size={17} />
            <div>
              <h2>Vitals History</h2>
              <p>
                Previous medical observations recorded at
                camps.
              </p>
            </div>
          </div>

          {patient.vitals?.length ? (
            <div className="vitals-history">
              {patient.vitals.map((record) => (
                <div
                  className="vitals-record"
                  key={record.id}
                >
                  <div>
                    <strong>
                      {new Date(
                        record.recordedAt
                      ).toLocaleString()}
                    </strong>

                    <p>
                      Temperature:{" "}
                      {record.temperature || "—"} · Pulse:{" "}
                      {record.pulse || "—"} · BP:{" "}
                      {record.bloodPressure || "—"} · SpO₂:{" "}
                      {record.spo2 || "—"} · Weight:{" "}
                      {record.weight || "—"}
                    </p>

                    {record.notes && (
                      <p>
                        <strong>Notes:</strong>{" "}
                        {record.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-patients">
              <Activity size={28} />

              <h3>No vitals recorded</h3>

              <p>
                Vitals entered by medical personnel will
                appear here.
              </p>
            </div>
          )}
        </div>

        <div className="profile-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onBack}
          >
            <ArrowLeft size={14} />
            Back to Records
          </button>
        </div>
      </div>
    </div>
  );
}

function WariHealthPassportPage({
  patient,
  onBack,
}) {
  if (!patient) {
    return (
      <div className="passport-page">
        <div className="passport-empty">
          <h2>No Warkari selected</h2>

          <button
            type="button"
            className="secondary-button"
            onClick={onBack}
          >
            <ArrowLeft size={14} />
            Back to Patient Records
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="passport-page">

      <div className="passport-card">

        <div className="passport-header">
          <div className="passport-heart">
            <HeartPulse size={30} />
          </div>

          <h1>WARI HEALTH</h1>
          <h2>PASSPORT</h2>
        </div>


        <div className="passport-qr-area">

          <div className="passport-qr-box">
            <QRCode
              value={patient.id}
              size={210}
              level="H"
            />
          </div>

        </div>


        <div className="passport-divider">
          <span></span>
          <strong>•</strong>
          <span></span>
        </div>


        <div className="passport-information">

          <div className="passport-info-row">

            <div className="passport-info-icon">
              <ClipboardList size={25} />
            </div>

            <div className="passport-info-content">
              <span>WARI HEALTH ID</span>

              <strong>
                {patient.id}
              </strong>
            </div>

          </div>


          <div className="passport-info-row">

            <div className="passport-info-icon">
              <User size={25} />
            </div>

            <div className="passport-info-content">
              <span>NAME</span>

              <strong>
                {patient.name}
              </strong>
            </div>

          </div>

        </div>


        <div className="passport-footer">
          <span></span>
          <HeartPulse size={18} />
          <span></span>
        </div>

      </div>


      <div className="passport-actions">

        <button
          type="button"
          className="primary-button"
          onClick={() => window.print()}
        >
          <Printer size={14} />
          Print / Save as PDF
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={onBack}
        >
          <ArrowLeft size={14} />
          Back to Record
        </button>

      </div>

    </div>
  );
}

/* =========================================================
   SMALL PROFILE COMPONENTS
   ========================================================= */

function ProfileField({ label, value }) {
  return (
    <div className="profile-field">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function MedicalInformation({
  icon,
  label,
  value,
}) {
  return (
    <div className="medical-information">
      <div className="medical-information-icon">
        {icon}
      </div>

      <div>
        <span>{label}</span>
        <p>{value}</p>
      </div>
    </div>
  );
}