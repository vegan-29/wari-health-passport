const express = require("express");
const router = express.Router();

const db = require("../db");

/* =========================================================
   HELPER: GET LOGGED-IN DOCTOR
   ========================================================= */

const getDoctor = (req, callback) => {
    const doctorId = req.headers["x-doctor-id"];

    if (!doctorId) {
        return callback(
            new Error("Doctor authentication is required"),
            null
        );
    }

    const query = `
        SELECT
            doctor_id,
            name,
            specialization,
            contact_number,
            camp_id
        FROM Doctor
        WHERE doctor_id = ?
    `;

    db.query(query, [doctorId], (err, result) => {
        if (err) {
            return callback(err, null);
        }

        if (result.length === 0) {
            return callback(
                new Error("Doctor not found"),
                null
            );
        }

        callback(null, result[0]);
    });
};


/* =========================================================
   HELPER: CHECK WHETHER DOCTOR CAN ACCESS WARKARI
   ========================================================= */

const checkPatientAccess = (
    doctor,
    patient,
    callback
) => {

    /*
     * New records contain registered_camp_id and
     * registered_doctor_id.
     *
     * Old demo records may not have these values.
     * For those records we use the earliest medical
     * record as the original registration visit.
     */

    if (
        patient.registered_camp_id &&
        patient.registered_doctor_id
    ) {

        const currentCampNumber = parseInt(
            String(doctor.camp_id).replace(/\D/g, ""),
            10
        );

        const patientCampNumber = parseInt(
            String(patient.registered_camp_id).replace(/\D/g, ""),
            10
        );

        /*
         * Previous camp:
         * Later camps can see patients from earlier camps.
         */
        if (
            !isNaN(currentCampNumber) &&
            !isNaN(patientCampNumber) &&
            patientCampNumber < currentCampNumber
        ) {
            return callback(null, true);
        }

        /*
         * Same camp:
         * Only the doctor who originally registered
         * the Warkari can see the new patient.
         */
        if (
            patient.registered_camp_id === doctor.camp_id &&
            patient.registered_doctor_id === doctor.doctor_id
        ) {
            return callback(null, true);
        }

        return callback(null, false);
    }


    /*
     * Legacy/demo Warkari:
     * Determine original camp and doctor from the
     * earliest medical record.
     */

    const legacyQuery = `
        SELECT
            doctor_id,
            camp_id
        FROM Medical_Record
        WHERE warkari_id = ?
        ORDER BY visit_date ASC, record_id ASC
        LIMIT 1
    `;

    db.query(
        legacyQuery,
        [patient.warkari_id],
        (err, result) => {

            if (err) {
                return callback(err, false);
            }

            /*
             * No medical history means we cannot establish
             * original ownership.
             *
             * For safety, deny access.
             */
            if (result.length === 0) {
                return callback(null, false);
            }

            const originalDoctorId =
                result[0].doctor_id;

            const originalCampId =
                result[0].camp_id;

            const currentCampNumber = parseInt(
                String(doctor.camp_id).replace(/\D/g, ""),
                10
            );

            const patientCampNumber = parseInt(
                String(originalCampId).replace(/\D/g, ""),
                10
            );

            /*
             * Previous camp.
             */
            if (
                !isNaN(currentCampNumber) &&
                !isNaN(patientCampNumber) &&
                patientCampNumber < currentCampNumber
            ) {
                return callback(null, true);
            }

            /*
             * Same camp and same doctor.
             */
            if (
                originalCampId === doctor.camp_id &&
                originalDoctorId === doctor.doctor_id
            ) {
                return callback(null, true);
            }

            return callback(null, false);
        }
    );
};


/* =========================================================
   GET ALL ACCESSIBLE WARKARIS
   ========================================================= */

router.get("/", (req, res) => {

    getDoctor(req, (doctorError, doctor) => {

        if (doctorError) {
            console.error(doctorError);

            return res.status(401).json({
                message: doctorError.message
            });
        }

        const query = `
            SELECT
                w.*,

                d.dindi_name,

                rd.doctor_id AS registered_doctor_id,
                rd.name AS registered_doctor_name,

                rc.camp_id AS registered_camp_id,
                rc.camp_name AS registered_camp_name

            FROM Warkari w

            LEFT JOIN Dindi d
                ON w.dindi_id = d.dindi_id

            LEFT JOIN Doctor rd
                ON w.registered_doctor_id = rd.doctor_id

            LEFT JOIN Medical_Camp rc
                ON w.registered_camp_id = rc.camp_id

            ORDER BY w.created_at DESC
        `;

        db.query(query, (err, patients) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    message: "Database error"
                });
            }

            /*
             * We need to evaluate access individually because
             * legacy records may not have registration metadata.
             */

            if (patients.length === 0) {
                return res.json([]);
            }

            const accessiblePatients = [];

            let completed = 0;

            patients.forEach((patient) => {

                checkPatientAccess(
                    doctor,
                    patient,
                    (accessError, allowed) => {

                        completed++;

                        if (
                            accessError
                        ) {
                            console.error(accessError);
                        }

                        if (allowed) {
                            accessiblePatients.push(patient);
                        }

                        if (
                            completed ===
                            patients.length
                        ) {
                            res.json(
                                accessiblePatients
                            );
                        }
                    }
                );
            });
        });
    });
});


/* =========================================================
   GET WARKARI PROFILE + COMPLETE MEDICAL HISTORY
   ========================================================= */

router.get("/:id", (req, res) => {

    const warkariId = req.params.id;

    getDoctor(req, (doctorError, doctor) => {

        if (doctorError) {
            console.error(doctorError);

            return res.status(401).json({
                message: doctorError.message
            });
        }

        const profileQuery = `
            SELECT
                w.*,

                d.dindi_name,

                rd.doctor_id AS registered_doctor_id,
                rd.name AS registered_doctor_name,

                rc.camp_id AS registered_camp_id,
                rc.camp_name AS registered_camp_name

            FROM Warkari w

            LEFT JOIN Dindi d
                ON w.dindi_id = d.dindi_id

            LEFT JOIN Doctor rd
                ON w.registered_doctor_id = rd.doctor_id

            LEFT JOIN Medical_Camp rc
                ON w.registered_camp_id = rc.camp_id

            WHERE w.warkari_id = ?
        `;

        db.query(
            profileQuery,
            [warkariId],
            (err, profileResult) => {

                if (err) {
                    console.error(err);

                    return res.status(500).json({
                        message: "Database error"
                    });
                }

                if (profileResult.length === 0) {
                    return res.status(404).json({
                        message: "Warkari not found"
                    });
                }

                const patient =
                    profileResult[0];

                checkPatientAccess(
                    doctor,
                    patient,
                    (accessError, allowed) => {

                        if (accessError) {
                            console.error(accessError);

                            return res.status(500).json({
                                message:
                                    "Could not verify patient access"
                            });
                        }

                        if (!allowed) {
                            return res.status(403).json({
                                message:
                                    "You do not have access to this Warkari's record"
                            });
                        }

                        const historyQuery = `
                            SELECT
                                mr.record_id,
                                mr.warkari_id,
                                mr.doctor_id,
                                mr.camp_id,
                                mr.visit_date,

                                mr.symptoms,
                                mr.diagnosis,

                                mr.blood_pressure,
                                mr.heart_rate,
                                mr.temperature,

                                mr.treatment,
                                mr.medications,
                                mr.remarks,

                                doc.name AS doctor_name,
                                doc.specialization
                                    AS doctor_specialization,

                                camp.camp_name,
                                camp.location
                                    AS camp_location

                            FROM Medical_Record mr

                            LEFT JOIN Doctor doc
                                ON mr.doctor_id =
                                   doc.doctor_id

                            LEFT JOIN Medical_Camp camp
                                ON mr.camp_id =
                                   camp.camp_id

                            WHERE mr.warkari_id = ?

                            ORDER BY
                                mr.visit_date DESC,
                                mr.record_id DESC
                        `;

                        db.query(
                            historyQuery,
                            [warkariId],
                            (err, historyResult) => {

                                if (err) {
                                    console.error(err);

                                    return res.status(500).json({
                                        message:
                                            "Database error while loading medical history"
                                    });
                                }

                                const contactQuery = `
                                    SELECT
                                        contact_id,
                                        contact_name,
                                        relationship,
                                        phone_number
                                    FROM Emergency_Contact
                                    WHERE warkari_id = ?
                                    LIMIT 1
                                `;

                                db.query(
                                    contactQuery,
                                    [warkariId],
                                    (err, contactResult) => {

                                        if (err) {
                                            console.error(err);

                                            return res.status(500).json({
                                                message:
                                                    "Database error while loading emergency contact"
                                            });
                                        }

                                        res.json({
                                            profile: patient,

                                            emergency_contact:
                                                contactResult[0] ||
                                                null,

                                            medical_history:
                                                historyResult
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
});


/* =========================================================
   REGISTER NEW WARKARI
   ========================================================= */

router.post("/register", (req, res) => {

    const {
        name,
        age,
        gender,
        blood_group,
        medical_conditions,
        allergies,
        current_medications,
        dindi_id,

        contact_name,
        relationship,
        phone_number,

        doctor_id,
        camp_id
    } = req.body;


    /* ---------------------------------------------------------
       BASIC VALIDATION
       --------------------------------------------------------- */

    if (
        !name ||
        !age ||
        !gender ||
        !blood_group
    ) {

        return res.status(400).json({
            message:
                "Please provide all required Warkari details"
        });
    }


    if (!doctor_id || !camp_id) {

        return res.status(400).json({
            message:
                "Doctor and camp information is required"
        });
    }


    /* ---------------------------------------------------------
       VERIFY DOCTOR + CAMP
       --------------------------------------------------------- */

    const doctorQuery = `
        SELECT
            doctor_id,
            name,
            camp_id
        FROM Doctor
        WHERE doctor_id = ?
          AND camp_id = ?
    `;

    db.query(
        doctorQuery,
        [doctor_id, camp_id],
        (err, doctorResult) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    message:
                        "Database error while verifying doctor"
                });
            }

            if (doctorResult.length === 0) {

                return res.status(403).json({
                    message:
                        "Doctor does not belong to the selected camp"
                });
            }


            /* -------------------------------------------------
               GENERATE WARI HEALTH ID
               ------------------------------------------------- */

            const currentYear = new Date()
                .getFullYear()
                .toString()
                .slice(-2);

            const prefix = `WC${currentYear}-`;

            const idQuery = `
                SELECT warkari_id
                FROM Warkari
                WHERE warkari_id LIKE ?
                ORDER BY CAST(
                    SUBSTRING(warkari_id, 6)
                    AS UNSIGNED
                ) DESC
                LIMIT 1
            `;

            db.query(
                idQuery,
                [`${prefix}%`],
                (err, result) => {

                    if (err) {
                        console.error(err);

                        return res.status(500).json({
                            message:
                                "Database error while generating Wari Health ID"
                        });
                    }

                    let nextNumber = 1;

                    if (result.length > 0) {

                        const lastId =
                            result[0].warkari_id;

                        const lastNumber =
                            parseInt(
                                lastId.substring(5),
                                10
                            );

                        if (!isNaN(lastNumber)) {
                            nextNumber =
                                lastNumber + 1;
                        }
                    }

                    const newId =
                        prefix +
                        String(nextNumber)
                            .padStart(6, "0");


                    /* -------------------------------------------------
                       INSERT WARKARI
                       ------------------------------------------------- */

                    const warkariQuery = `
                        INSERT INTO Warkari
                        (
                            warkari_id,
                            name,
                            age,
                            gender,
                            blood_group,
                            medical_conditions,
                            allergies,
                            current_medications,
                            dindi_id,
                            registered_doctor_id,
                            registered_camp_id
                        )
                        VALUES
                        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    const warkariValues = [
                        newId,
                        name,
                        age,
                        gender,
                        blood_group,
                        medical_conditions || null,
                        allergies || null,
                        current_medications || null,
                        dindi_id || null,
                        doctor_id,
                        camp_id
                    ];


                    db.query(
                        warkariQuery,
                        warkariValues,
                        (err) => {

                            if (err) {
                                console.error(err);

                                return res.status(500).json({
                                    message:
                                        "Could not register Warkari"
                                });
                            }


                            /* -------------------------------------------------
                               INSERT EMERGENCY CONTACT
                               ------------------------------------------------- */

                            const contactQuery = `
                                INSERT INTO emergency_contact
                                (
                                    warkari_id,
                                    contact_name,
                                    relationship,
                                    phone_number
                                )
                                VALUES (?, ?, ?, ?)
                            `;

                            const contactValues = [
                                newId,
                                contact_name || null,
                                relationship || null,
                                phone_number || null
                            ];


                            db.query(
                                contactQuery,
                                contactValues,
                                (err) => {

                                    if (err) {
                                        console.error(err);

                                        return res.status(500).json({
                                            message:
                                                "Warkari registered but emergency contact could not be saved"
                                        });
                                    }


                                    /* -------------------------------------------------
                                       SUCCESS
                                       ------------------------------------------------- */

                                    res.status(201).json({

                                        message:
                                            "Warkari registered successfully",

                                        warkari_id:
                                            newId,

                                        registered_doctor_id:
                                            doctor_id,

                                        registered_camp_id:
                                            camp_id
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});


/* =========================================================
   ADD MEDICAL RECORD / VISIT
   ========================================================= */

router.post("/:id/medical-record", (req, res) => {

    const warkariId = req.params.id;

    const {
        symptoms,
        diagnosis,
        blood_pressure,
        heart_rate,
        temperature,
        treatment,
        medications,
        remarks
    } = req.body;


    getDoctor(req, (doctorError, doctor) => {

        if (doctorError) {
            console.error(doctorError);

            return res.status(401).json({
                message: doctorError.message
            });
        }


        /* ---------------------------------------------------------
           CHECK THAT WARKARI EXISTS
           --------------------------------------------------------- */

        const patientQuery = `
            SELECT *
            FROM Warkari
            WHERE warkari_id = ?
        `;

        db.query(
            patientQuery,
            [warkariId],
            (err, patientResult) => {

                if (err) {
                    console.error(err);

                    return res.status(500).json({
                        message:
                            "Database error"
                    });
                }

                if (patientResult.length === 0) {
                    return res.status(404).json({
                        message:
                            "Warkari not found"
                    });
                }

                const patient =
                    patientResult[0];


                /* -------------------------------------------------
                   CHECK ACCESS
                   ------------------------------------------------- */

                checkPatientAccess(
                    doctor,
                    patient,
                    (accessError, allowed) => {

                        if (accessError) {
                            console.error(accessError);

                            return res.status(500).json({
                                message:
                                    "Could not verify patient access"
                            });
                        }

                        if (!allowed) {
                            return res.status(403).json({
                                message:
                                    "You do not have permission to add a medical record for this Warkari"
                            });
                        }


                        /* -------------------------------------------------
                           INSERT MEDICAL RECORD
                           ------------------------------------------------- */

                        const insertQuery = `
                            INSERT INTO Medical_Record
                            (
                                warkari_id,
                                doctor_id,
                                camp_id,
                                symptoms,
                                diagnosis,
                                blood_pressure,
                                heart_rate,
                                temperature,
                                treatment,
                                medications,
                                remarks
                            )
                            VALUES
                            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `;

                        const values = [
                            warkariId,
                            doctor.doctor_id,
                            doctor.camp_id,
                            symptoms || null,
                            diagnosis || null,
                            blood_pressure || null,
                            heart_rate || null,
                            temperature || null,
                            treatment || null,
                            medications || null,
                            remarks || null
                        ];


                        db.query(
                            insertQuery,
                            values,
                            (err, result) => {

                                if (err) {
                                    console.error(err);

                                    return res.status(500).json({
                                        message:
                                            "Could not save medical record"
                                    });
                                }


                                res.status(201).json({

                                    message:
                                        "Medical record saved successfully",

                                    record_id:
                                        result.insertId,

                                    warkari_id:
                                        warkariId,

                                    doctor_id:
                                        doctor.doctor_id,

                                    camp_id:
                                        doctor.camp_id
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});


/* =========================================================
   DELETE WARKARI
   ========================================================= */

router.delete("/:id", (req, res) => {

    const warkariId = req.params.id;

    getDoctor(req, (doctorError, doctor) => {

        if (doctorError) {
            console.error(doctorError);

            return res.status(401).json({
                message: doctorError.message
            });
        }

        const patientQuery = `
            SELECT *
            FROM Warkari
            WHERE warkari_id = ?
        `;

        db.query(
            patientQuery,
            [warkariId],
            (err, patientResult) => {

                if (err) {
                    console.error(err);

                    return res.status(500).json({
                        message: "Database error"
                    });
                }

                if (patientResult.length === 0) {
                    return res.status(404).json({
                        message:
                            "Warkari not found"
                    });
                }

                const patient =
                    patientResult[0];

                checkPatientAccess(
                    doctor,
                    patient,
                    (accessError, allowed) => {

                        if (accessError) {
                            console.error(accessError);

                            return res.status(500).json({
                                message:
                                    "Could not verify patient access"
                            });
                        }

                        if (!allowed) {
                            return res.status(403).json({
                                message:
                                    "You do not have permission to delete this Warkari"
                            });
                        }


                        db.beginTransaction(
                            (err) => {

                                if (err) {
                                    console.error(err);

                                    return res.status(500).json({
                                        message:
                                            "Could not start delete operation"
                                    });
                                }


                                /* -----------------------------------------
                                   DELETE EMERGENCY CONTACT
                                   ----------------------------------------- */

                                const deleteContactQuery = `
                                    DELETE FROM emergency_contact
                                    WHERE warkari_id = ?
                                `;

                                db.query(
                                    deleteContactQuery,
                                    [warkariId],
                                    (err) => {

                                        if (err) {
                                            return db.rollback(
                                                () => {

                                                    console.error(err);

                                                    res.status(500).json({
                                                        message:
                                                            "Could not delete emergency contact"
                                                    });
                                                }
                                            );
                                        }


                                        /* -----------------------------------------
                                           DELETE MEDICAL RECORDS
                                           ----------------------------------------- */

                                        const deleteMedicalQuery = `
                                            DELETE FROM Medical_Record
                                            WHERE warkari_id = ?
                                        `;

                                        db.query(
                                            deleteMedicalQuery,
                                            [warkariId],
                                            (err) => {

                                                if (err) {
                                                    return db.rollback(
                                                        () => {

                                                            console.error(err);

                                                            res.status(500).json({
                                                                message:
                                                                    "Could not delete medical records"
                                                            });
                                                        }
                                                    );
                                                }


                                                /* -----------------------------------------
                                                   DELETE WARKARI
                                                   ----------------------------------------- */

                                                const deleteWarkariQuery = `
                                                    DELETE FROM Warkari
                                                    WHERE warkari_id = ?
                                                `;

                                                db.query(
                                                    deleteWarkariQuery,
                                                    [warkariId],
                                                    (err, result) => {

                                                        if (err) {
                                                            return db.rollback(
                                                                () => {

                                                                    console.error(err);

                                                                    res.status(500).json({
                                                                        message:
                                                                            "Could not delete Warkari"
                                                                    });
                                                                }
                                                            );
                                                        }


                                                        if (
                                                            result.affectedRows === 0
                                                        ) {

                                                            return db.rollback(
                                                                () => {

                                                                    res.status(404).json({
                                                                        message:
                                                                            "Warkari not found"
                                                                    });
                                                                }
                                                            );
                                                        }


                                                        db.commit(
                                                            (err) => {

                                                                if (err) {
                                                                    return db.rollback(
                                                                        () => {

                                                                            console.error(err);

                                                                            res.status(500).json({
                                                                                message:
                                                                                    "Could not complete delete operation"
                                                                            });
                                                                        }
                                                                    );
                                                                }


                                                                res.json({
                                                                    message:
                                                                        "Warkari deleted successfully",

                                                                    warkari_id:
                                                                        warkariId
                                                                });
                                                            }
                                                        );
                                                    }
                                                );
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
});


module.exports = router;